import { NextResponse } from "next/server";
import { readGameConfig } from "@/lib/territories/configStore";

export async function GET() {
  const config = await readGameConfig();
  return NextResponse.json(config);
}
