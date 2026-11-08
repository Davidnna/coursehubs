<?php

declare(strict_types=1);

/** Private Cloudflare R2 object storage using the S3-compatible API. */
final class ObjectStorage
{
    public static function isConfigured(): bool
    {
        foreach (['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as $key) {
            if (trim((string) Config::get($key, '')) === '') return false;
        }
        return function_exists('curl_init');
    }

    public static function putFile(string $localPath, string $key, string $contentType): void
    {
        if (!self::isConfigured()) throw new RuntimeException('Object storage is not configured.');
        $body = file_get_contents($localPath);
        if ($body === false) throw new RuntimeException('The uploaded file could not be read.');
        self::request('PUT', $key, $body, $contentType);
    }

    public static function delete(string $key): void
    {
        if (!self::isConfigured()) return;
        self::request('DELETE', $key, '');
    }

    public static function presignedUrl(string $key, string $filename, string $mimeType, bool $inline = false, int $expires = 300): string
    {
        if (!self::isConfigured()) throw new RuntimeException('Object storage is not configured.');
        $host = self::host();
        $uri = self::objectUri($key);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $amzDate = $now->format('Ymd\THis\Z');
        $dateStamp = $now->format('Ymd');
        $accessKey = (string) Config::get('R2_ACCESS_KEY_ID');
        $secret = (string) Config::get('R2_SECRET_ACCESS_KEY');
        $scope = $dateStamp . '/auto/s3/aws4_request';
        $safeFilename = preg_replace('/[^A-Za-z0-9._ -]/', '_', basename($filename)) ?: 'course-resource';
        $disposition = ($inline ? 'inline' : 'attachment') . '; filename="' . $safeFilename . '"';
        $params = [
            'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential' => $accessKey . '/' . $scope,
            'X-Amz-Date' => $amzDate,
            'X-Amz-Expires' => (string) max(60, min(900, $expires)),
            'X-Amz-SignedHeaders' => 'host',
            'response-content-disposition' => $disposition,
            'response-content-type' => $mimeType,
        ];
        $canonicalQuery = self::canonicalQuery($params);
        $canonicalHeaders = 'host:' . $host . "\n";
        $canonicalRequest = "GET\n" . $uri . "\n" . $canonicalQuery . "\n" . $canonicalHeaders . "\nhost\nUNSIGNED-PAYLOAD";
        $stringToSign = "AWS4-HMAC-SHA256\n" . $amzDate . "\n" . $scope . "\n" . hash('sha256', $canonicalRequest);
        $signature = hash_hmac('sha256', $stringToSign, self::signingKey($secret, $dateStamp));
        return 'https://' . $host . $uri . '?' . $canonicalQuery . '&X-Amz-Signature=' . $signature;
    }

    private static function request(string $method, string $key, string $body, ?string $contentType = null): void
    {
        $host = self::host();
        $uri = self::objectUri($key);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $amzDate = $now->format('Ymd\THis\Z');
        $dateStamp = $now->format('Ymd');
        $payloadHash = hash('sha256', $body);
        $headers = [
            'host' => $host,
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date' => $amzDate,
        ];
        if ($contentType !== null) $headers['content-type'] = $contentType;
        ksort($headers);
        $canonicalHeaders = '';
        foreach ($headers as $name => $value) $canonicalHeaders .= $name . ':' . trim($value) . "\n";
        $signedHeaders = implode(';', array_keys($headers));
        $canonicalRequest = $method . "\n" . $uri . "\n\n" . $canonicalHeaders . "\n" . $signedHeaders . "\n" . $payloadHash;
        $scope = $dateStamp . '/auto/s3/aws4_request';
        $stringToSign = "AWS4-HMAC-SHA256\n" . $amzDate . "\n" . $scope . "\n" . hash('sha256', $canonicalRequest);
        $signature = hash_hmac('sha256', $stringToSign, self::signingKey((string) Config::get('R2_SECRET_ACCESS_KEY'), $dateStamp));
        $authorization = 'AWS4-HMAC-SHA256 Credential=' . Config::get('R2_ACCESS_KEY_ID') . '/' . $scope
            . ', SignedHeaders=' . $signedHeaders . ', Signature=' . $signature;
        $curlHeaders = ['Authorization: ' . $authorization];
        foreach ($headers as $name => $value) $curlHeaders[] = $name . ': ' . $value;

        $curl = curl_init('https://' . $host . $uri);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $curlHeaders,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 15,
        ]);
        if ($method === 'PUT') curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, $method);
        $response = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);
        if ($response === false || $status < 200 || $status >= 300) {
            error_log('CourseHubs R2 storage request failed: method=' . $method . ' status=' . $status . ' transport=' . ($curlError !== '' ? $curlError : 'none'));
            throw new RuntimeException('The resource file could not be stored.');
        }
    }

    private static function host(): string
    {
        return trim((string) Config::get('R2_ACCOUNT_ID')) . '.r2.cloudflarestorage.com';
    }

    private static function objectUri(string $key): string
    {
        $bucket = rawurlencode((string) Config::get('R2_BUCKET'));
        $segments = array_map('rawurlencode', explode('/', ltrim($key, '/')));
        return '/' . $bucket . '/' . implode('/', $segments);
    }

    private static function canonicalQuery(array $params): string
    {
        $encoded = [];
        foreach ($params as $key => $value) $encoded[rawurlencode((string) $key)] = rawurlencode((string) $value);
        ksort($encoded, SORT_STRING);
        $parts = [];
        foreach ($encoded as $key => $value) $parts[] = $key . '=' . $value;
        return implode('&', $parts);
    }

    private static function signingKey(string $secret, string $dateStamp): string
    {
        $dateKey = hash_hmac('sha256', $dateStamp, 'AWS4' . $secret, true);
        $regionKey = hash_hmac('sha256', 'auto', $dateKey, true);
        $serviceKey = hash_hmac('sha256', 's3', $regionKey, true);
        return hash_hmac('sha256', 'aws4_request', $serviceKey, true);
    }
}
