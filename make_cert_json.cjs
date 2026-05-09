const fs = require('fs');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env'));

const json = JSON.stringify({
  key: 'EFIBANK_CERT_PATH',
  value: env.EFIBANK_CERT_PATH,
  is_preview: false,
  is_literal: true
});

fs.writeFileSync('env_cert.json', json);
