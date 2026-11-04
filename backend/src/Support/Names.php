<?php

/**
 * Names are trimmed and stored, then always displayed with each
 * name's first letter capitalized — this keeps matching (elsewhere,
 * e.g. linking an "Other" lecturer name to a real account) reliable
 * regardless of how the person typed their name at signup.
 */
final class Names
{
    public static function clean(string $value): string
    {
        return trim(preg_replace('/\s+/', ' ', $value));
    }

    public static function display(string $value): string
    {
        $clean = self::clean($value);

        if (function_exists('mb_convert_case')) {
            return mb_convert_case(mb_strtolower($clean, 'UTF-8'), MB_CASE_TITLE, 'UTF-8');
        }

        // Portable fallback if the mbstring extension isn't enabled.
        // ucwords() with these delimiters also capitalizes correctly
        // after hyphens/apostrophes (e.g. "mary-jane" -> "Mary-Jane").
        return ucwords(strtolower($clean), " \t\r\n\f\v-'");
    }
}
