import { NextResponse } from "next/server";
import {
  assertRequestSize,
  ingestDocument,
  IngestionError,
  isIngestionError,
  validateUpload,
  type IngestionResult,
} from "@/lib/ingestion";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Large decks and PDFs can take a while to parse.
export const maxDuration = 60;

type ErrorBody = { error: { code: string; message: string } };

/**
 * POST /api/upload
 * Body: multipart/form-data with a `file` field (.pdf or .pptx, max 25 MB).
 * 201 → IngestionResult. 4xx/5xx → { error: { code, message } }.
 */
export async function POST(request: Request): Promise<NextResponse<IngestionResult | ErrorBody>> {
  try {
    assertRequestSize(request);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      throw new IngestionError("MALFORMED_REQUEST", 400, "The upload could not be read as multipart form data.", {
        cause: err,
      });
    }

    const upload = await validateUpload(formData);
    const db = getSupabaseAdmin();
    const result = await ingestDocument(db, upload);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown): NextResponse<ErrorBody> {
  if (isIngestionError(err)) {
    if (err.status >= 500) console.error(`[upload] ${err.code}`, err.cause ?? err);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }

  console.error("[upload] unexpected error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong while processing the file." } },
    { status: 500 },
  );
}
