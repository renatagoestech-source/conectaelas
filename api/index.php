<?php
header('Content-Type: application/json; charset=utf-8');
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$a = $_GET['a'] ?? '';
$S = getenv('APP_SECRET') ?: '';
function require_secret() { global $S; if (strlen($S) < 32) throw new RuntimeException('APP_SECRET ausente ou fraco'); }
function out($d, $c = 200) { http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function db() {
  static $p;
  if (!$p) {
    foreach (['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $key)
      if (getenv($key) === false || getenv($key) === '') throw new RuntimeException('CONFIG:O banco de dados ainda não foi configurado no Vercel.');
    $p = new PDO('mysql:host='.getenv('DB_HOST').';port='.(getenv('DB_PORT') ?: 3306).';dbname='.getenv('DB_NAME').';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASS'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => false]);
  }
  return $p;
}
function q($s, $x = []) { $t = db()->prepare($s); $t->execute($x); return $t; }
function token($u) { require_secret(); global $S; $p = base64_encode(json_encode(['id' => (int)$u['id'], 'role' => $u['role'], 'exp' => time() + 604800])); return $p.'.'.hash_hmac('sha256', $p, $S); }
function auth($roles = null) {
  require_secret(); global $S; $h = $_SERVER['HTTP_X_TOKEN'] ?? ''; [$p, $s] = array_pad(explode('.', $h), 2, '');
  if (!$p || !hash_equals(hash_hmac('sha256', $p, $S), $s)) out(['error' => 'Faça login'], 401);
  $d = json_decode(base64_decode($p), true);
  if ($d['exp'] < time()) out(['error' => 'Sessão expirada'], 401);
  if ($roles && !in_array($d['role'], $roles)) out(['error' => 'Sem permissão'], 403);
  return $d;
}
function s($k) { global $in; return trim((string)($in[$k] ?? '')); }

try { switch ($a) {

case 'cats': out(q('SELECT name FROM categories ORDER BY name')->fetchAll(PDO::FETCH_COLUMN));

case 'register':
  $role = s('role') === 'provider' ? 'provider' : 'client';
  if (!s('name') || !filter_var(s('email'), FILTER_VALIDATE_EMAIL) || strlen(s('password')) < 6 || !s('whatsapp')) out(['error' => 'Preencha nome, e-mail, WhatsApp e senha (mín. 6)'], 400);
  if (q('SELECT id FROM users WHERE email=?', [s('email')])->fetch()) out(['error' => 'E-mail já cadastrado'], 400);
  q('INSERT INTO users(role,name,email,pass,whatsapp) VALUES(?,?,?,?,?)', [$role, s('name'), s('email'), password_hash(s('password'), PASSWORD_DEFAULT), s('whatsapp')]);
  $id = db()->lastInsertId();
  if ($role === 'provider') q('INSERT INTO providers(user_id,category,city) VALUES(?,?,?)', [$id, s('category'), s('city')]);
  $u = ['id' => $id, 'role' => $role, 'name' => s('name')];
  out(['token' => token($u), 'user' => $u]);

case 'login':
  $ae = getenv('ADMIN_EMAIL');
  if ($ae && s('email') === $ae && s('password') === getenv('ADMIN_PASS') && !q('SELECT id FROM users WHERE email=?', [$ae])->fetch())
    q("INSERT INTO users(role,name,email,pass,whatsapp) VALUES('admin','Administrador',?,?,'')", [$ae, password_hash(getenv('ADMIN_PASS'), PASSWORD_DEFAULT)]);
  $u = q('SELECT * FROM users WHERE email=?', [s('email')])->fetch();
  if (!$u || !password_verify(s('password'), $u['pass'])) out(['error' => 'E-mail ou senha inválidos'], 401);
  out(['token' => token($u), 'user' => ['id' => $u['id'], 'role' => $u['role'], 'name' => $u['name']]]);

case 'providers':
  $w = ['1']; $x = [];
  if (!empty($_GET['cat'])) { $w[] = 'p.category=?'; $x[] = $_GET['cat']; }
  if (!empty($_GET['q'])) { $w[] = '(u.name LIKE ? OR p.bio LIKE ? OR EXISTS(SELECT 1 FROM services s WHERE s.provider_id=u.id AND s.title LIKE ?))'; $l = '%'.$_GET['q'].'%'; array_push($x, $l, $l, $l); }
  $r = q('SELECT u.id,u.name,p.category,p.logo,p.city,(SELECT MIN(price) FROM services WHERE provider_id=u.id) AS min_price,(SELECT images FROM services WHERE provider_id=u.id ORDER BY id LIMIT 1) AS img FROM users u JOIN providers p ON p.user_id=u.id WHERE '.implode(' AND ', $w).' ORDER BY u.id DESC LIMIT 60', $x)->fetchAll();
  out($r);

case 'provider':
  $id = (int)($_GET['id'] ?? 0);
  $p = q('SELECT u.id,u.name,u.whatsapp,p.category,p.bio,p.logo,p.city FROM users u JOIN providers p ON p.user_id=u.id WHERE u.id=?', [$id])->fetch();
  if (!$p) out(['error' => 'Não encontrado'], 404);
  $p['services'] = q('SELECT * FROM services WHERE provider_id=? ORDER BY id DESC', [$id])->fetchAll();
  $p['slots'] = q('SELECT id,day,hour FROM slots WHERE provider_id=? AND booked=0 AND day>=CURDATE() ORDER BY day,hour', [$id])->fetchAll();
  out($p);

case 'my_profile':
  $me = auth(['provider']);
  out(q('SELECT u.name,u.whatsapp,p.category,p.bio,p.logo,p.city FROM users u JOIN providers p ON p.user_id=u.id WHERE u.id=?', [$me['id']])->fetch());

case 'profile_save':
  $me = auth(['provider']);
  q('UPDATE users SET name=?,whatsapp=? WHERE id=?', [s('name'), s('whatsapp'), $me['id']]);
  q('UPDATE providers SET category=?,bio=?,logo=?,city=? WHERE user_id=?', [s('category'), s('bio'), s('logo'), s('city'), $me['id']]);
  out(['ok' => 1]);

case 'service_save':
  $me = auth(['provider']);
  if (!s('title') || !is_numeric($in['price'] ?? null)) out(['error' => 'Informe título e valor'], 400);
  q('INSERT INTO services(provider_id,title,descr,price,images) VALUES(?,?,?,?,?)', [$me['id'], s('title'), s('descr'), $in['price'], json_encode(array_values(array_filter(array_map('trim', explode("\n", s('images'))))))]);
  out(['ok' => 1]);

case 'service_del':
  $me = auth(['provider']); q('DELETE FROM services WHERE id=? AND provider_id=?', [(int)$in['id'], $me['id']]); out(['ok' => 1]);

case 'slot_add':
  $me = auth(['provider']);
  foreach ((array)($in['hours'] ?? []) as $h) if (preg_match('/^\d{2}:\d{2}$/', $h) && preg_match('/^\d{4}-\d{2}-\d{2}$/', s('day')))
    q('INSERT IGNORE INTO slots(provider_id,day,hour) VALUES(?,?,?)', [$me['id'], s('day'), $h]);
  out(['ok' => 1]);

case 'my_slots':
  $me = auth(['provider']);
  out(q('SELECT id,day,hour,booked FROM slots WHERE provider_id=? AND day>=CURDATE() ORDER BY day,hour', [$me['id']])->fetchAll());

case 'slot_del':
  $me = auth(['provider']); q('DELETE FROM slots WHERE id=? AND provider_id=? AND booked=0', [(int)$in['id'], $me['id']]); out(['ok' => 1]);

case 'book':
  $me = auth(['client']);
  $sl = q('SELECT * FROM slots WHERE id=? AND booked=0', [(int)$in['slot_id']])->fetch();
  $sv = q('SELECT id FROM services WHERE id=? AND provider_id=?', [(int)$in['service_id'], $sl['provider_id'] ?? 0])->fetch();
  if (!$sl || !$sv) out(['error' => 'Horário indisponível'], 400);
  $upd = q('UPDATE slots SET booked=1 WHERE id=? AND booked=0', [$sl['id']]);
  if (!$upd->rowCount()) out(['error' => 'Horário acabou de ser reservado'], 400);
  q('INSERT INTO bookings(slot_id,service_id,client_id,provider_id) VALUES(?,?,?,?)', [$sl['id'], $sv['id'], $me['id'], $sl['provider_id']]);
  out(['ok' => 1]);

case 'bookings':
  $me = auth(['client', 'provider']);
  $col = $me['role'] === 'client' ? 'client_id' : 'provider_id'; $other = $me['role'] === 'client' ? 'provider_id' : 'client_id';
  out(q("SELECT b.id,b.status,sl.day,sl.hour,sv.title,sv.price,o.name AS other_name,o.whatsapp AS other_whatsapp FROM bookings b JOIN slots sl ON sl.id=b.slot_id JOIN services sv ON sv.id=b.service_id JOIN users o ON o.id=b.$other WHERE b.$col=? ORDER BY sl.day DESC,sl.hour", [$me['id']])->fetchAll());

case 'booking_status':
  $me = auth(['client', 'provider']); $st = in_array(s('status'), ['confirmado', 'cancelado']) ? s('status') : 'pendente';
  $col = $me['role'] === 'client' ? 'client_id' : 'provider_id';
  if ($me['role'] === 'client' && $st !== 'cancelado') out(['error' => 'Sem permissão'], 403);
  $b = q("SELECT slot_id FROM bookings WHERE id=? AND $col=?", [(int)$in['id'], $me['id']])->fetch();
  if ($b) { q('UPDATE bookings SET status=? WHERE id=?', [$st, (int)$in['id']]); if ($st === 'cancelado') q('UPDATE slots SET booked=0 WHERE id=?', [$b['slot_id']]); }
  out(['ok' => 1]);

case 'admin_users': auth(['admin']);
  out(q("SELECT u.id,u.role,u.name,u.email,u.whatsapp,u.created,p.category FROM users u LEFT JOIN providers p ON p.user_id=u.id WHERE u.role<>'admin' ORDER BY u.id DESC")->fetchAll());

case 'admin_user_del': auth(['admin']); $id = (int)$in['id'];
  foreach (['services' => 'provider_id', 'slots' => 'provider_id', 'providers' => 'user_id', 'bookings' => 'client_id'] as $t => $c) q("DELETE FROM $t WHERE $c=?", [$id]);
  q("DELETE FROM users WHERE id=? AND role<>'admin'", [$id]); out(['ok' => 1]);

case 'admin_cat_add': auth(['admin']); q('INSERT IGNORE INTO categories(name) VALUES(?)', [s('name')]); out(['ok' => 1]);
case 'admin_cat_del': auth(['admin']); q('DELETE FROM categories WHERE name=?', [s('name')]); out(['ok' => 1]);

case 'admin_bookings': auth(['admin']);
  out(q('SELECT b.id,b.status,sl.day,sl.hour,sv.title,c.name AS client,p.name AS provider FROM bookings b JOIN slots sl ON sl.id=b.slot_id JOIN services sv ON sv.id=b.service_id JOIN users c ON c.id=b.client_id JOIN users p ON p.id=b.provider_id ORDER BY b.id DESC LIMIT 100')->fetchAll());

default: out(['error' => 'Ação inválida'], 404);
} } catch (Throwable $e) { error_log((string)$e); if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'CONFIG:')) out(['error' => substr($e->getMessage(), 7)], 503); out(['error' => 'Erro interno do servidor'], 500); }
