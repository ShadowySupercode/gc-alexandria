import { nip19 } from 'nostr-tools';
import WebSocket from 'ws';

const naddr = 'naddr1qvzqqqr4tqpzphzv6zrv6l89kxpj4h60m5fpz2ycsrfv0c54hjcwdpxqrt8wwlqxqyd8wumn8ghj7argv4nx7un9wd6zumn0wd68yvfwvdhk6qgmwaehxw309a6xsetrd96xzer9dshxummnw3erztnrdakszyrhwden5te0dehhxarj9ekxzmnyqyg8wumn8ghj7mn0wd68ytnhd9hx2qghwaehxw309ahx7um5wgh8xmmkvf5hgtngdaehgqg3waehxw309ahx7um5wgerztnrdakszxthwden5te0wpex7enfd3jhxtnwdaehgu339e3k7mgpz4mhxue69uhkzem8wghxummnw3ezumrpdejqzxrhwden5te0wfjkccte9ehx7umhdpjhyefwvdhk6qg5waehxw309aex2mrp0yhxgctdw4eju6t0qyt8wumn8ghj7un9d3shjtnwdaehgu3wvfskueqpr9mhxue69uhkvun9v4kxz7fwwdhhvcnfwshxsmmnwsqrcctwv9exx6rfwd6xjcedddhx7amvv4jxwefdw35x2ttpwf6z6mmx946xs6twdd5kueedwa5hg6r0w46z6ur9wfkkjumnd9hkuwdu5na';

console.log('Decoding naddr...\n');
const decoded = nip19.decode(naddr);
console.log('Decoded:', JSON.stringify(decoded, null, 2));

const { data } = decoded;
const rootAddress = `${data.kind}:${data.pubkey}:${data.identifier}`;
console.log('\nRoot Address:', rootAddress);

// Fetch the index event to see what sections it references
const relay = 'wss://relay.nostr.band';

async function fetchPublication() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relay);
    const events = [];

    ws.on('open', () => {
      console.log(`\nConnected to ${relay}`);
      console.log('Fetching index event...\n');

      const filter = {
        kinds: [data.kind],
        authors: [data.pubkey],
        '#d': [data.identifier],
      };

      const subscriptionId = `sub-${Date.now()}`;
      ws.send(JSON.stringify(['REQ', subscriptionId, filter]));
    });

    ws.on('message', (message) => {
      const [type, subId, event] = JSON.parse(message.toString());

      if (type === 'EVENT') {
        events.push(event);
        console.log('Found index event:', event.id);
        console.log('\nTags:');
        event.tags.forEach(tag => {
          if (tag[0] === 'a') {
            console.log(`  Section address: ${tag[1]}`);
          }
          if (tag[0] === 'd') {
            console.log(`  D-tag: ${tag[1]}`);
          }
          if (tag[0] === 'title') {
            console.log(`  Title: ${tag[1]}`);
          }
        });
      } else if (type === 'EOSE') {
        ws.close();
        resolve(events);
      }
    });

    ws.on('error', reject);

    setTimeout(() => {
      ws.close();
      resolve(events);
    }, 5000);
  });
}

fetchPublication()
  .then(() => console.log('\nDone!'))
  .catch(console.error);
