import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getServiceClient();

    // Verify the case exists
    const { error: caseError } = await supabase
      .from('cases')
      .select('id')
      .eq('id', id)
      .single();

    if (caseError) {
      if (caseError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Case not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: caseError.message },
        { status: 500 }
      );
    }

    // Fetch audit log entries for the case
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error fetching audit log:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
