const owner = "gkhumble1";
const repo = "Organized-Pickleball-Manager";
const folder = "cloud-rosters";

export async function handler() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { statusCode: 500, body: "Missing GITHUB_TOKEN" };
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 404) {
      return {
        statusCode: 200,
        body: JSON.stringify({ rosters: [] }),
      };
    }

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "GitHub list failed", details: text }),
      };
    }

    const files = await response.json();
    const rosters = files
      .filter((f) => f.type === "file" && f.name.endsWith(".json"))
      .map((f) => f.name.replace(/\.json$/i, ""));

    return {
      statusCode: 200,
      body: JSON.stringify({ rosters }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

