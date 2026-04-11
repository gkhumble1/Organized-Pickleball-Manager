const owner = "gkhumble1";
const repo = "Organized-Pickleball-Manager";
const folder = "cloud-rosters";

function slugify(name) {
  return name.trim().replace(/[^a-z0-9\-]+/gi, "_");
}

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { statusCode: 500, body: "Missing GITHUB_TOKEN" };
    }

    const params = new URLSearchParams(event.queryStringParameters || {});
    const name = params.get("name") || event.queryStringParameters?.name;
    if (!name) {
      return { statusCode: 400, body: "Missing name" };
    }

    const slug = slugify(name);
    const path = `${folder}/${slug}.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 404) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Roster not found" }),
      };
    }

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "GitHub load failed", details: text }),
      };
    }

    const fileData = await response.json();
    const decoded = Buffer.from(fileData.content, "base64").toString("utf8");
    const snapshot = JSON.parse(decoded);

    return {
      statusCode: 200,
      body: JSON.stringify({ snapshot }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

