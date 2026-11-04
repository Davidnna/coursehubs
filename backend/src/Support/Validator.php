<?php

/**
 * Minimal validation helper. Collects errors keyed by field name so
 * the frontend can show them next to the right input, rather than
 * one flat error string.
 */
final class Validator
{
    private array $errors = [];

    public function __construct(private array $data)
    {
    }

    public function required(string $field, string $label): self
    {
        $value = $this->data[$field] ?? null;

        if ($value === null || trim((string) $value) === '') {
            $this->errors[$field] = "{$label} is required.";
        }

        return $this;
    }

    public function email(string $field): self
    {
        $value = $this->data[$field] ?? '';

        if ($value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] = 'Enter a valid email address.';
        }

        return $this;
    }

    public function minLength(string $field, int $length, string $label): self
    {
        $value = (string) ($this->data[$field] ?? '');

        if ($value !== '' && strlen($value) < $length) {
            $this->errors[$field] = "{$label} must be at least {$length} characters.";
        }

        return $this;
    }

    public function in(string $field, array $allowed, string $label): self
    {
        $value = $this->data[$field] ?? null;

        if ($value !== null && !in_array($value, $allowed, true)) {
            $this->errors[$field] = "{$label} must be one of: " . implode(', ', $allowed) . '.';
        }

        return $this;
    }

    public function levelRange(string $field, int $min, int $max, string $label): self
    {
        $value = $this->data[$field] ?? null;

        if ($value !== null && $value !== '') {
            $intValue = (int) $value;
            if ($intValue < $min || $intValue > $max || $intValue % 100 !== 0) {
                $this->errors[$field] = "{$label} must be a level between {$min} and {$max}, in steps of 100.";
            }
        }

        return $this;
    }

    public function fails(): bool
    {
        return count($this->errors) > 0;
    }

    public function errors(): array
    {
        return $this->errors;
    }
}
