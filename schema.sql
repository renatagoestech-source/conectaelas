CREATE TABLE users(id INT AUTO_INCREMENT PRIMARY KEY, role ENUM('admin','provider','client') NOT NULL, name VARCHAR(120), email VARCHAR(160) UNIQUE, pass VARCHAR(255), whatsapp VARCHAR(30), created TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE categories(id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) UNIQUE);
CREATE TABLE providers(user_id INT PRIMARY KEY, category VARCHAR(80), bio TEXT, logo VARCHAR(500), city VARCHAR(80));
CREATE TABLE services(id INT AUTO_INCREMENT PRIMARY KEY, provider_id INT, title VARCHAR(160), descr TEXT, price DECIMAL(10,2), images TEXT);
CREATE TABLE slots(id INT AUTO_INCREMENT PRIMARY KEY, provider_id INT, day DATE, hour VARCHAR(5), booked TINYINT DEFAULT 0, UNIQUE(provider_id,day,hour));
CREATE TABLE bookings(id INT AUTO_INCREMENT PRIMARY KEY, slot_id INT, service_id INT, client_id INT, provider_id INT, status ENUM('pendente','confirmado','cancelado') DEFAULT 'pendente', created TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO categories(name) VALUES ('Cabelo'),('Unhas'),('Maquiagem'),('Sobrancelhas e Cílios'),('Estética'),('Barbearia'),('Massagem');
