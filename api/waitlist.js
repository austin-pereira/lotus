export default async function handler(req, res) {
  // Allow CORS (so your static HTML can call this endpoint)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, email, company, source, ts } = req.body || {};

    const cleanEmail = (email || "").toString().trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const token = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    if (!token || !baseId || !tableName) {
      return res.status(500).json({ error: "Missing Airtable env vars" });
    }

    // Prevent duplicate emails by searching first
    const searchUrl =
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}` +
      `?filterByFormula=${encodeURIComponent(`LOWER({Email})='${cleanEmail}'`)}`;

    const searchResp = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!searchResp.ok) {
      const txt = await searchResp.text().catch(() => "");
      return res.status(500).json({ error: "Airtable search failed", details: txt });
    }

    const searchJson = await searchResp.json();
    const alreadyExists = Array.isArray(searchJson.records) && searchJson.records.length > 0;

    if (alreadyExists) {
      return res.status(200).json({ ok: true, deduped: true });
    }

    // Create record
    const createUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;

    const record = {
      fields: {
        Email: cleanEmail,
        Name: (name || "").toString().trim(),
        Company: (company || "").toString().trim(),
        Source: (source || "landing_page").toString().trim(),
        Timestamp: ts ? new Date(ts).toISOString() : new Date().toISOString(),
        "User Agent": req.headers["user-agent"] || ""
        // NOTE: IP is not reliably available on all setups. You can add it if you proxy headers.
      }
    };

    const createResp = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(record)
    });

    if (!createResp.ok) {
      const txt = await createResp.text().catch(() => "");
      return res.status(500).json({ error: "Airtable create failed", details: txt });
    }

    return res.status(200).json({ ok: true, created: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
