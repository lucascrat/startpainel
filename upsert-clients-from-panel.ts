/**
 * Upsert em lote de todos os 89 clientes coletados do painel via browser.
 * Dados coletados em 29/05/2026 diretamente do cms.startpainel.cc.
 *
 * Como rodar:  npm run upsert-clients
 * (adicione "upsert-clients": "tsx upsert-clients-from-panel.ts" no package.json)
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// formato: username | password | whatsapp | appName | appMac | appPassword | expirationDate | linesCount | status | name
const RAW = `Guerreirotv|sxyudhmj|+5585996308321||47:ab:9c:73:69:ed||2026-06-21|1|active|GUERREIRO
Irmaalexandre|mt47w63k|+5588992634421||||2026-06-07|1|active|Raimundo
morganatv2026|h7rjxsck|+55 88 99324-0547|Ibo player|64:1c:b0:58:02:f5|620645|2026-06-25|1|active|Morgana
503644375|099031685|+5588992136647||c7:d5:82:32:d7:71||2026-06-15|1|active|Anamayre
daniel2026|sau8kxbh|+5521970949403||||2026-06-13|1|active|DANIEL
jhonnytv|a4qhrzbp|+5588981981531||00:7D:38:1E:D0:E8||2026-06-24|1|active|jhonny
Laercioquicktv|6he4krwd|+5588997728439||4c:57:39:20:a9:76||2026-07-08|2|active|LAERCIO
PrisIBO2025|ust4fwaq|+5521980035622||38:32:85:25:4e:9a||2026-06-21|1|active|pris
Cbdasilva|s8g2hxzn|+55 88 99769-5764||||2026-06-25|1|active|Cicero
Badatv2027|xcvd9yw6|+5588981460090||80:47:86:26:a9:26||2026-06-13|1|active|Bada
wedsontv|sc7krau1|+5588999322396|fun play|99:a9:a1:e1:66:b1|370736|2026-06-10|1|active|wedson
judatv2026|fad963g2|+55 88 99346-2267||||2026-06-22|1|active|JUDA
SUBDACOSTA|r4npdk3b|+5588993275518||b0:3f:11:9e:f8:42||2026-06-07|1|active|sub da costa
djanetv2026|4hw63dqz|+5588992859922||81:9c:d8:da:fd:d8||2026-06-09|1|active|djane
Nenemtv|y89vrgqx|+5588994926272||e0:03:6b:9b:20:58||2026-06-07|1|active|nenem
alinebeulke|twx8v47g|+55 21 96999-6320||53:38:99:41:34:99||2026-06-17|1|active|Aline
juracy2026|fwg34pzn|+5521965430472||df:6c:8b:53:e1:16||2026-06-23|1|active|juracy
Severa|uw4z6cjp|+5588994848732||||2026-06-07|1|active|SEVERINA
Gilsintv2025|f2nh15em|+5588981447161|fun play|37:1e:e6:a5:21:1d||2026-06-08|1|active|sargento gilson
Israeltv|cjng1kyv|+5588996107829||00:07:c5:28:3a:8d||2026-06-03|1|active|israel
Neebaicinho|ygxsfe76|+5511951210264||70:09:71:3b:64:a7||2026-06-28|1|active|cliente
Caiorua|s8wjr2kd|+5588994471488||98:06:3c:1e:65:83||2026-06-07|1|active|CAIO
Gildenberg|jaub1txc|+5588996592775||a7:3f:15:39:bd:30||2026-05-29|1|expired|gildenberg
anasofia|u2rv7k4j|+5511949907094||51:8b:b1:7e:26:fb||2026-06-05|1|active|ana sofia
Sgtlima|6kmsvqnh|+5588994207021||64:1c:ae:88:e4:28||2026-06-05|2|active|sargento lima
Capvilartv|vn5c3a28|+5588981786043||70:2a:d5:13:95:8d||2026-05-28|1|expired|capitao villar
Lilatv|bjx9f64e|+5521995131532||6c:00:70:dc:f4:34||2026-06-07|1|active|lila
Robsontv2026|xjpnmd5a|+55 21 96436-0384|XCLOUD|||2026-06-17|1|active|Robson Mesquita
Cbtiago|q5yzrwva|+5588992127907||||2026-06-03|1|active|CB TIAGO
Novooriente|4s1crmke|||||2026-06-16|1|active|
Ipc2026|5m8c42f6|+5581996573944||25:7e:3c:19:a5:df||2026-06-02|1|active|LUA
Ismaelraio|7keczmw8|+5588999107159||0c:83:8b:28:23:c5||2026-05-29|1|expired|ISMAEL
Hedmotv|aj2mrwft|+55 88 9936-6451||||2026-06-16|1|active|Hedmo Mendes
Jmatos|mnyvfraw|+5588992308161||65:44:be:7e:94:30||2026-06-11|1|active|jorge
Renataaguiar|872nrz6u|+5588992644130||a9:21:63:b3:9c:5b||2026-06-27|1|active|Renata aguiar
solimartv|9zme76n2|+55 85 8462-9252|XCLOUD|9HF978||2026-06-16|1|active|Solimar
manoelcl|2x78ygja|||||2026-06-09|1|active|Manoel
Perlatv3|er2mgpaq|+5588997022638||b2:e8:e8:3a:cb:0f||2026-06-25|1|active|perla
sinal03|rpmyv1t4|+558899436952|ibo pro 1|68:cc:33:55:22:29||2026-06-26|3|active|sargento milton
Beatrizlima|uf5w8jpb|+5585997843409||1c:af:4a:4e:7a:bf||2026-06-27|1|active|beatriz
Fdiego|ypnur2kw|+5588992850396||80:93:21:96:24:07||2026-06-24|1|active|Diego
Fabianovargas|1c94t6kr|+5588997931598||6b:34:86:03:f2:23||2026-06-27|1|active|fabiano
Sgttiotonio|fpjen6hs|+558899431104||||2026-06-25|1|active|sargento tiotonio
Tenfreitas|d8s6jfwp|+5585998168031||c3:dc:80:4f:ee:88||2026-06-26|1|active|tenentefreitas
Evandomartins|x26u1p7k|+55 88 9495-1555||37:4f:50:e1:8d:23|703990|2026-06-16|1|active|Evando
Nayrontv2026|pbcafvu1|+5588992574918||04:e4:b6:9e:25:d0||2026-06-25|1|active|nayron
Tenandre|acdbwshu|+5588988106188||92:9b:bc:e1:82:22||2026-06-10|1|active|tenente andre
Liliancosta|31jky5hd|+55 21 96743-2929||b8:bb:af:f0:bc:90||2026-06-15|1|active|Lilian
Eciliotv2026|6kgwzjxr|+5588996498137||20:15:de:89:c2:9d||2026-06-26|1|active|Ecilio
Subleonardo|hkw1ju9v|+5588997088198||||2026-05-29|1|expired|sub leonardo
Subitamartv|vnseyr79|+5588994332548||||2026-06-14|1|active|subtenente itamar
Leidianetv|6dukfxah|+5521981959563||a0:49:40:4a:90:74||2026-06-18|1|active|leidiane
Selciotv2026|qydmvc7u|+5588999394802||||2026-06-28|1|active|solange
JOELMATV2026|yehkwj26|+55 88 9270-0054||68:07:0a:5b:01:39||2026-06-12|1|active|Joelma
Cesinhatv206|5artqdk6|+55 88 9683-2886||F8:01:B4:74:F5:78||2026-06-20|2|active|Cesinha
Bonfimtv|8f9avndh|+55 88 99324-0547|Ibo player|2c:0e:c2:71:96:56|732327|2026-08-05|1|active|Morgana
Gabrieletv2026|ex7p1tzw|+558899699832||b8:a0:b8:a6:e4:41||2026-06-18|1|active|gabrielle
Fcampelo2026|ux6p2tdw|+55 88 9249-8055||3d:82:73:d5:00:af||2026-06-11|1|active|Francisco Campelo
Joacilio|3gwpxrvf|+5588999279961||12:ee:89:3e:3d:b1||2026-06-14|1|active|joacilio
martinely2027|4v7h1amn|+55 21 99949-9926||25:1e:06:b5:78:d3|507227|2026-06-10|1|active|Marlinelly
Sgtfernando|w1h7mxeu|+5588999747642||84:c0:ef:bd:25:3d||2026-07-06|3|active|fernando
Sgtalexandrecl2|u8w72h9v|+55 88 9205-7370||04:CB:01:9D:74:5A||2026-06-10|2|active|Alexandre
Ronaldocli|mzs6fh3t|+5588993429310||b1:52:8c:2b:9b:75||2026-06-21|3|active|ronaldo
Holanda2026|vuafsr7x|||||2026-08-09|3|active|Holanda
Gilsontv2027|7fyz5whx|+5588921538177||7e:87:c8:be:f6:a0||2026-06-02|1|active|Gilson marques
Subbelarmino|e16ykfxr|+55 88 8108-8327||||2026-06-09|1|active|Belarmino
josuetv2026|vxj64mk9|+558899208357||||2026-06-15|1|active|josue
sgtoseiastv|5xke1p93|+5588998191704||||2026-06-16|1|active|sargento oseias
sgtdeywes2026|71v3zrqy|+55 88 9204-2071||||2026-06-05|1|active|Sgtdeives
Nailstv|f7uhw89p|+5588981654931||||2026-06-13|1|active|Luciana
amigomizael|5ud2zjgm|+5521969086564||ba:32:df:1f:a3:dc||2026-06-10|1|active|Amigo mizael
erisvaldo2026|nt4aqp53|+5588996638685||||2026-06-03|1|active|erisvaldo
Barbosatv|3qxrjavg|||||2026-06-12|2|active|
Arissom|6apm41vz|||||2026-06-09|1|active|Arissom
Martinsveras|gf9j43kv|+5588997023576||4c:1b:2f:12:7d:15||2026-06-13|1|active|martins veras
Jaciratv|35y2rsje|+5588981241991||fa:76:86:0f:82:61||2026-06-17|1|active|jacira
Sgtgilvan|tvr4hpd6|+5588993042411||e6:2b:1e:c5:dc:39||2026-06-09|1|active|sargento gilvan
tenenteivo2026|21ymtpsr|+5588981831939||ca:8e:2a:c9:1d:72||2026-05-29|1|expired|ivo
Yuritv2026|zpheq9fn|+5588981548870||44:9a:58:18:2c:b1|561550|2026-06-29|1|active|yury
Diegosparta|98zykp3g|+5588992245514|quickplayer|21:e4:95:0d:91:cc|163682|2026-06-28|1|active|Diego
Fernandoquick|4cfvd5pj|+5588992384423|quickplayer|xf:cb:j7:9x:ac:8g|765556|2026-06-27|1|active|fernando
renanrodrigues|1egybprv|+5543999620141||7a:5m:z2:dh:dx:3a||2026-06-26|1|active|renan rodrigues
bulhoestv2027|sfh6m1a5|+5588994139358||94:e6:ba:26:66:ca||2026-06-24|1|active|alexandre
Joanatv2026|gre1nbmk|+5588996580906||44:CB:8B:FB:13:0E||2026-06-22|1|active|joana
Tvalanrua|a9cu716j|+5588994168875|quickplayer|f1:d6:39:9b:75:b8||2026-06-23|1|active|alan
Marcinhatv|bn26avu8|+5588994768202||58:96:0A:F0:62:90||2026-06-22|1|active|marcia`;

interface ClientRow {
  username: string; password: string; whatsapp: string|null; appName: string|null;
  appMac: string|null; appPassword: string|null; expirationDate: string|null;
  linesCount: number; status: string; name: string|null;
}

const CLIENTS: ClientRow[] = RAW.trim().split('\n').map(line => {
  const [username, password, whatsapp, appName, appMac, appPassword, expirationDate, linesCountStr, status, ...nameParts] = line.split('|');
  return {
    username, password,
    whatsapp: whatsapp || null,
    appName: appName || null,
    appMac: appMac || null,
    appPassword: appPassword || null,
    expirationDate: expirationDate || null,
    linesCount: parseInt(linesCountStr) || 1,
    status,
    name: nameParts.join('|') || null,
  };
});

async function upsertCustomer(c: ClientRow): Promise<'created' | 'updated'> {
  const existing = await pool.query('SELECT id FROM customers WHERE username = $1', [c.username]);
  let customerId: number;

  const playlistUrl = c.password
    ? `http://starton.sbs:8880/get.php?username=${encodeURIComponent(c.username)}&password=${encodeURIComponent(c.password)}&type=m3u_plus&output=m3u8`
    : null;

  if (!existing.rowCount) {
    const ins = await pool.query(
      `INSERT INTO customers (username, name, whatsapp, password, playlist_url, expiration_date, lines_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [c.username, c.name||null, c.whatsapp||null, c.password||null, playlistUrl, c.expirationDate, c.linesCount, c.status]
    );
    customerId = ins.rows[0].id;
  } else {
    customerId = existing.rows[0].id;
    await pool.query(
      `UPDATE customers SET
         password        = COALESCE($2, password),
         playlist_url    = COALESCE($3, playlist_url),
         expiration_date = COALESCE($4::date, expiration_date),
         lines_count     = $5,
         status          = $6,
         name            = COALESCE(NULLIF($7,''), name),
         whatsapp        = COALESCE(NULLIF($8,''), whatsapp),
         updated_at      = NOW()
       WHERE username = $1`,
      [c.username, c.password, playlistUrl, c.expirationDate, c.linesCount, c.status, c.name||null, c.whatsapp||null]
    );
  }

  if (c.appName) {
    const appExists = await pool.query(
      `SELECT id FROM customer_apps WHERE customer_id=$1 AND app_name=$2`,
      [customerId, c.appName]
    );
    if (!appExists.rowCount) {
      await pool.query(
        `INSERT INTO customer_apps (customer_id, app_name, mac_address, password) VALUES ($1,$2,$3,$4)`,
        [customerId, c.appName, c.appMac||null, c.appPassword||null]
      );
    } else {
      await pool.query(
        `UPDATE customer_apps SET mac_address=COALESCE($3,mac_address), password=COALESCE($4,password)
         WHERE customer_id=$1 AND app_name=$2`,
        [customerId, c.appName, c.appMac||null, c.appPassword||null]
      );
    }
  }

  return existing.rowCount ? 'updated' : 'created';
}

(async () => {
  console.log(`\n🚀 Upsert de ${CLIENTS.length} clientes no banco\n`);
  const stats = { created: 0, updated: 0, fail: 0 };

  for (const client of CLIENTS) {
    try {
      process.stdout.write(`  ${client.username.padEnd(20)} ... `);
      const result = await upsertCustomer(client);
      if (result === 'created') stats.created++; else stats.updated++;
      const flags = [
        client.password  ? '✓senha' : '✗senha',
        client.whatsapp  ? '✓tel'   : '✗tel',
        client.appName   ? `✓app(${client.appName})` : '',
        client.appMac    ? '✓mac'   : '',
      ].filter(Boolean).join(' ');
      console.log(`${result.toUpperCase().padEnd(7)} ${flags}`);
    } catch (e: any) {
      stats.fail++;
      console.log(`❌ ${e.message}`);
    }
  }

  console.log(`\n══════════════════ RESUMO ══════════════════`);
  console.log(`  🆕 Criados:     ${stats.created}`);
  console.log(`  🔄 Atualizados: ${stats.updated}`);
  console.log(`  ❌ Falhas:      ${stats.fail}`);
  console.log(`════════════════════════════════════════════\n`);

  await pool.end();
})();
