const owner = "gkhumble1";
const repo = "Organized-Pickleball-Manager";
const folder = "cloud-rosters";

function slugify(name) {
  return name.trim().replace(/[^a-z0-9\-]+/gi, "_");
}

export async function handler(event) {
  if (event.httpMethod !== "POST" && event.httpMethod !== "DELETE") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { statusCode: 500, body: "Missing GITHUB_TOKEN" };
    }

    const body = JSON.parse(event.body || "{}");
    const name = body.name;
    if (!name) {
      return { statusCode: 400, body: "Missing name" };
    }

    const slug = slugify(name);
    const path = `${folder}/${slug}.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // Get SHA first
    const getFile = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (getFile.status === 404) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Roster not found" }),
      };
    }

    if (!getFile.ok) {
      const text = await getFile.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "GitHub get failed", details: text }),
      };
    }

    const fileData = await getFile.json();
    const sha = fileData.sha;

    const delResponse = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Delete cloud roster: ${name}`,
        sha,
      }),
    });

    if (!delResponse.ok) {
      const text = await delResponse.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "GitHub delete failed", details: text }),
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

