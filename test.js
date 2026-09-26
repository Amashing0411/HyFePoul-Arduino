
async function run() {
  const url = `http://127.0.0.1:9000/commands/device-002.json?ns=hyfepoul-dev-default-rtdb&orderBy="status"&equalTo="queued"`;
  const res = await fetch(url, { headers: { 'Authorization': 'Bearer owner' } });
  console.log(await res.text());
}
run();
