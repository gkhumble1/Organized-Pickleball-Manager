import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    // Parse the incoming JSON from your app
    const body = JSON.parse(event.body);

    // Your GitHub token stored in Netlify (never exposed to users)
    const token = process.env.GITHUB_TOKEN;

    // Your GitHub repo info
    const owner = "gkhumble1";
    const repo = "Organized-Pickleball-Manager";
    const path = "shared-season-stats.json";

    // Convert JSON to Base64 (GitHub API requirement)
    const content = Buffer.from(JSON.stringify(body, null, 2)).toString("base64");

    // GitHub API endpoint to update a file
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // First, check if the file already exists (to get its SHA)
    const getFile = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    let sha = undefined;
    if (getFile.ok) {
      const fileData = await getFile.json();
      sha = fileData.sha; // Needed for updating existing file
    }

    // Now PUT the new content
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Update season stats",
        content,
        sha
      }),
    });

    if (!response.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "GitHub update failed" }),
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
