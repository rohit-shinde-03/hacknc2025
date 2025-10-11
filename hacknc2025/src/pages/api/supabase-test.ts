import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../utils/supabase"; // path may vary

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Example: call a safe endpoint. Replace 'your_table' with a public table name.
    const { data, error } = await supabase
      .from("your_table")
      .select("id")
      .limit(1);
    if (error) {
      return res.status(500).json({ ok: false, error: error.message || error });
    }
    return res.status(200).json({ ok: true, sample: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
