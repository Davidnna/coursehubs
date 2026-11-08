<?php

declare(strict_types=1);

/**
 * Private Neon Object Storage adapter using its S3-compatible API.
 *
 * Neon requires AWS Signature Version 4, the branch-specific S3 endpoint,
 * the configured AWS region, and path-style bucket addressing:
 *   https://<branch-endpoint>/<bucket>/<object-key>
 *
 * No third-party SDK is required; signing is implemented with PHP hash_hmac.
 */
final class ObjectStorage
{
    public static function isConfigured(): bool
    {
        if (!function_exists('curl_init')) {
            return false;
        }

        try {
            self::configuration();
            return true;
        } catch (Throwable) {
            return false;
        }
    }

    public static function putFile(string $localPath, string $key, string $contentType): void
    {
        $body = file_get_contents($localPath);
        if ($body === false) {
            throw new RuntimeException('The uploaded file could not be read.');
        }

        self::request('PUT', $key, $body, $contentType);
    }

    public static function delete(string $key): void
    {
        if (!self::isConfigured()) {
            return;
        }

        self::request('DELETE', $key, '');
    }

    public static function presignedUrl(
        string $key,
        string $filename,
        string $mimeType,
        bool $inline = false,
        int $expires = 300
    ): string {
        $config = self::configuration();
        $uri = self::objectUri($key, $config['bucket']);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $amzDate = $now->format('Ymd\THis\Z');
        $dateStamp = $now->format('Ymd');
        $scope = $dateStamp . '/' . $config['region'] . '/s3/aws4_request';

        // Keep the response header safe for a URL query parameter and a filename.
        $safeFilename = preg_replace('/[^A-Za-z0-9._ -]/', '_', basename($filename)) ?: 'course-resource';
        $disposition = ($inline ? 'inline' : 'attachment') . '; filename="' . $safeFilename . '"';

        $params = [
            'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential' => $config['access_key'] . '/' . $scope,
            'X-Amz-Date' => $amzDate,
            'X-Amz-Expires' => (string) max(60, min(900, $expires)),
            'X-Amz-SignedHeaders' => 'host',
            'response-content-disposition' => $disposition,
            'response-content-type' => $mimeType,
        ];

        $canonicalQuery = self::canonicalQuery($params);
        $canonicalHeaders = 'host:' . $config['host'] . "\n";
        $canonicalRequest = "GET\n"
            . $uri . "\n"
            . $canonicalQuery . "\n"
            . $canonicalHeaders . "\n"
            . "host\n"
            . 'UNSIGNED-PAYLOAD';

        $stringToSign = "AWS4-HMAC-SHA256\n"
            . $amzDate . "\n"
            . $scope . "\n"
            . hash('sha256', $canonicalRequest);

        $signature = hash_hmac(
            'sha256',
            $stringToSign,
            self::signingKey($config['secret_key'], $dateStamp, $config['region'])
        );

        return $config['endpoint'] . $uri . '?' . $canonicalQuery . '&X-Amz-Signature=' . $signature;
    }

    private static function request(
        string $method,
        string $key,
        string $body,
        ?string $contentType = null
    ): void {
        if (!in_array($method, ['PUT', 'DELETE'], true)) {
            throw new InvalidArgumentException('Unsupported object storage operation.');
        }

        $config = self::configuration();
        $uri = self::objectUri($key, $config['bucket']);
        $url = $config['endpoint'] . $uri;

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $amzDate = $now->format('Ymd\THis\Z');
        $dateStamp = $now->format('Ymd');
        $payloadHash = hash('sha256', $body);

        $headers = [
            'host' => $config['host'],
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date' => $amzDate,
        ];
        if ($contentType !== null) {
            $headers['content-type'] = trim($contentType);
        }

        ksort($headers, SORT_STRING);

        $canonicalHeaders = '';
        foreach ($headers as $name => $value) {
            $canonicalHeaders .= $name . ':' . trim($value) . "\n";
        }

        $signedHeaders = implode(';', array_keys($headers));
        $canonicalRequest = $method . "\n"
            . $uri . "\n"
            . "\n"
            . $canonicalHeaders . "\n"
            . $signedHeaders . "\n"
            . $payloadHash;

        $scope = $dateStamp . '/' . $config['region'] . '/s3/aws4_request';
        $stringToSign = "AWS4-HMAC-SHA256\n"
            . $amzDate . "\n"
            . $scope . "\n"
            . hash('sha256', $canonicalRequest);

        $signature = hash_hmac(
            'sha256',
            $stringToSign,
            self::signingKey($config['secret_key'], $dateStamp, $config['region'])
        );

        $authorization = 'AWS4-HMAC-SHA256 Credential=' . $config['access_key'] . '/' . $scope
            . ', SignedHeaders=' . $signedHeaders
            . ', Signature=' . $signature;

        $curlHeaders = ['Authorization: ' . $authorization];
        foreach ($headers as $name => $value) {
            $curlHeaders[] = $name . ': ' . $value;
        }

        $curl = curl_init($url);
        if ($curl === false) {
            throw new RuntimeException('The resource storage connection could not be started.');
        }

        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $curlHeaders,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CUSTOMREQUEST => $method,
        ];

        if ($method === 'PUT') {
            $options[CURLOPT_POSTFIELDS] = $body;
        }

        curl_setopt_array($curl, $options);
        $response = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($response === false || $status < 200 || $status >= 300) {
            error_log(
                'CourseHubs Neon Object Storage request failed: operation=' . $method
                . ' status=' . $status
                . ' transport=' . ($curlError !== '' ? $curlError : 'none')
            );
            throw new RuntimeException('The resource file could not be stored.');
        }
    }

    /**
     * @return array{
     *   endpoint:string,
     *   host:string,
     *   region:string,
     *   bucket:string,
     *   access_key:string,
     *   secret_key:string
     * }
     */
    private static function configuration(): array
    {
        $endpoint = rtrim(trim((string) Config::get('AWS_ENDPOINT_URL_S3', '')), '/');
        $accessKey = trim((string) Config::get('AWS_ACCESS_KEY_ID', ''));
        $secretKey = trim((string) Config::get('AWS_SECRET_ACCESS_KEY', ''));
        $region = trim((string) Config::get('AWS_REGION', ''));
        $bucket = trim((string) Config::get('AWS_BUCKET_NAME', ''));

        $parts = $endpoint !== '' ? parse_url($endpoint) : false;
        if (
            $parts === false
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || empty($parts['host'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || !in_array((string) ($parts['path'] ?? ''), ['', '/'], true)
        ) {
            throw new RuntimeException('The object storage endpoint is invalid.');
        }

        if (
            $accessKey === ''
            || $secretKey === ''
            || !preg_match('/^[a-z0-9-]{3,32}$/D', $region)
            || !preg_match('/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/D', $bucket)
        ) {
            throw new RuntimeException('The object storage credentials or bucket configuration is incomplete.');
        }

        $host = strtolower((string) $parts['host']);
        if (isset($parts['port'])) {
            $host .= ':' . (int) $parts['port'];
        }

        return [
            'endpoint' => $endpoint,
            'host' => $host,
            'region' => $region,
            'bucket' => $bucket,
            'access_key' => $accessKey,
            'secret_key' => $secretKey,
        ];
    }

    private static function objectUri(string $key, string $bucket): string
    {
        $key = ltrim($key, '/');
        if ($key === '') {
            throw new InvalidArgumentException('An object key is required.');
        }

        $segments = array_map('rawurlencode', explode('/', $key));
        return '/' . rawurlencode($bucket) . '/' . implode('/', $segments);
    }

    private static function canonicalQuery(array $params): string
    {
        $encoded = [];
        foreach ($params as $key => $value) {
            $encoded[rawurlencode((string) $key)] = rawurlencode((string) $value);
        }

        ksort($encoded, SORT_STRING);
        $parts = [];
        foreach ($encoded as $key => $value) {
            $parts[] = $key . '=' . $value;
        }

        return implode('&', $parts);
    }

    private static function signingKey(string $secret, string $dateStamp, string $region): string
    {
        $dateKey = hash_hmac('sha256', $dateStamp, 'AWS4' . $secret, true);
        $regionKey = hash_hmac('sha256', $region, $dateKey, true);
        $serviceKey = hash_hmac('sha256', 's3', $regionKey, true);
        return hash_hmac('sha256', 'aws4_request', $serviceKey, true);
    }
}
