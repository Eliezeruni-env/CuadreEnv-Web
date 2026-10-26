const http = require('http');

function post(url, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    console.log('Logging in to get dev token (without /v1)...');
    let loginRes = await post('http://localhost:52510/auth/dev/token', {
      companyId: 1,
      userId: 1,
      email: 'dev@local'
    });
    
    let token = loginRes.body && loginRes.body.accessToken;
    if (!token) {
      console.log('Failed without /v1, status:', loginRes.status, 'body:', loginRes.body);
      console.log('Trying with /v1...');
      loginRes = await post('http://localhost:52510/v1/auth/dev/token', {
        companyId: 1,
        userId: 1,
        email: 'dev@local'
      });
      token = loginRes.body && loginRes.body.accessToken;
    }

    if (!token) {
      console.error('Failed to get token with both URLs. Last status:', loginRes.status, 'body:', loginRes.body);
      return;
    }
    console.log('Token acquired successfully.');

    console.log('\n--- 1. Probing GET /v1/Customer (No params) ---');
    const custRes = await get('http://localhost:52510/v1/Customer', token);
    console.log('Type of response:', Array.isArray(custRes) ? 'Array' : typeof custRes);
    console.log('Keys of response:', typeof custRes === 'object' ? Object.keys(custRes) : 'N/A');
    if (custRes.items) {
      console.log('Items length:', custRes.items.length);
      console.log('Total count:', custRes.totalItemCount || custRes.total);
    } else if (Array.isArray(custRes)) {
      console.log('Length:', custRes.length);
    } else {
      console.log('Snippet:', JSON.stringify(custRes).substring(0, 300));
    }

    console.log('\n--- 2. Probing GET /v1/Customer (With pageNumber=1, pageSize=50) ---');
    const custPagedRes = await get('http://localhost:52510/v1/Customer?pageNumber=1&pageSize=50', token);
    console.log('Type of response:', Array.isArray(custPagedRes) ? 'Array' : typeof custPagedRes);
    console.log('Keys of response:', typeof custPagedRes === 'object' ? Object.keys(custPagedRes) : 'N/A');
    if (custPagedRes.items) {
      console.log('Items length:', custPagedRes.items.length);
      console.log('Total count:', custPagedRes.totalItemCount || custPagedRes.total);
    } else if (Array.isArray(custPagedRes)) {
      console.log('Length:', custPagedRes.length);
    }

    console.log('\n--- 3. Probing GET /v1/Inventory/low-stock ---');
    const lowStockRes = await get('http://localhost:52510/v1/Inventory/low-stock', token);
    console.log('Response structure:', typeof lowStockRes, Array.isArray(lowStockRes) ? 'Array' : Object.keys(lowStockRes));
    console.log('Snippet:', JSON.stringify(lowStockRes).substring(0, 400));

    console.log('\n--- 4. Probing GET /v1/Sale ---');
    const saleRes = await get('http://localhost:52510/v1/Sale', token);
    console.log('Response structure:', typeof saleRes, Array.isArray(saleRes) ? 'Array' : Object.keys(saleRes));
    console.log('Snippet:', JSON.stringify(saleRes).substring(0, 400));

  } catch (err) {
    console.error('Error running probe:', err);
  }
}

run();
