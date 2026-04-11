const owner = "gkhumble1";
const repo = "Organized-Pickleball-Manager";
const folder = "cloud-rosters";

function slugify(name) {
  return name.trim().replace(/[^a-z0-9\-]+/gi, "_");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { statusCode: 500, body: "Missing GITHUB_TOKEN" };
    }

    const body = JSON.parse(event.body || "{}");
    const name = body.name;
    const snapshot = body.snapshot;

    if (!name || !snapshot) {
      return { statusCode: 400, body: "Missing name or snapshot" };
    }

    const slug = slugify(name);
    const path = `${folder}/${slug}.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const content = Buffer.from(JSON.stringify(snapshot, null, 2)).toString("base64");

    // Check if file exists to get SHA
    const getFile = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    let sha = undefined;
    if (getFile.ok) {
      const fileData = await getFile.json();
      sha = fileData.sha;
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Save cloud roster: ${name}`,
        content,
        sha,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "GitHub update failed", details: text }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

