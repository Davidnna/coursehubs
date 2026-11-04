# Render backend deployment: root directory = backend, runtime = Docker
FROM php:8.3-apache

# PHP PDO driver for MySQL/MariaDB and Apache URL rewriting.
RUN docker-php-ext-install pdo_mysql \
    && a2enmod rewrite \
    && sed -i 's/Listen 80/Listen 10000/' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:10000>/' /etc/apache2/sites-available/000-default.conf \
    && sed -i 's|DocumentRoot /var/www/html|DocumentRoot /var/www/html/public|' /etc/apache2/sites-available/000-default.conf \
    && printf '<Directory /var/www/html/public>\n    Options FollowSymLinks\n    AllowOverride All\n    Require all granted\n</Directory>\n' > /etc/apache2/conf-available/coursehub.conf \
    && a2enconf coursehub

WORKDIR /var/www/html
COPY . .

EXPOSE 10000
CMD ["apache2-foreground"]
