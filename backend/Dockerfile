# Render backend deployment: root directory = backend, runtime = Docker
FROM php:8.3-apache

# PostgreSQL PDO, cURL for Nylas and Neon S3-compatible Object Storage, file MIME detection, and Apache URL rewriting.
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libcurl4-openssl-dev \
    && docker-php-ext-install pdo_pgsql curl \
    && printf 'display_errors=Off\ndisplay_startup_errors=Off\nlog_errors=On\nerror_reporting=E_ALL\nupload_max_filesize=26M\npost_max_size=27M\nmax_execution_time=120\n' > /usr/local/etc/php/conf.d/zz-coursehubs-production.ini \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod rewrite \
    && sed -i 's/Listen 80/Listen 10000/' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:10000>/' /etc/apache2/sites-available/000-default.conf \
    && sed -i 's|DocumentRoot /var/www/html|DocumentRoot /var/www/html/public|' /etc/apache2/sites-available/000-default.conf \
    && printf '<Directory /var/www/html/public>\n    Options FollowSymLinks\n    AllowOverride All\n    Require all granted\n</Directory>\n' > /etc/apache2/conf-available/coursehubs.conf \
    && a2enconf coursehubs

WORKDIR /var/www/html
COPY . .

EXPOSE 10000
CMD ["sh", "-c", "php bin/migrate.php && exec apache2-foreground"]
