import { NextResponse } from 'next/server';
import { WorkspaceError } from './workspace';
export function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Local save failed.' }, { status: error instanceof WorkspaceError ? error.status : 400 });
}
