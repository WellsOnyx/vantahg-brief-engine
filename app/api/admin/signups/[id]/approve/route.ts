import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const signupId = params.id

    // 1. Get the signup
    const { data: signup, error: signupError } = await supabase
      .from('signups')
      .select('*')
      .eq('id', signupId)
      .single()

    if (signupError || !signup) {
      return NextResponse.json({ error: 'Signup not found' }, { status: 404 })
    }

    // 2. Create client row (existing logic)
    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: signup.company_name || signup.legal_name,
        contact_email: signup.signer_email || signup.contact_email,
        contact_name: signup.signer_name || signup.contact_name,
        status: 'active'
      })
      .select()
      .single()

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    // 3. === NEW: Auto-create user + magic link ===
    const signerEmail = signup.signer_email || signup.contact_email
    const signerName = signup.signer_name || signup.contact_name

    if (signerEmail) {
      try {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: signerEmail,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/client/cases`,
            data: {
              full_name: signerName,
              client_id: newClient.id,
              signup_id: signup.id
            }
          }
        })

        if (linkError) {
          console.error('Magic link error:', linkError)
        } else {
          console.log(`✅ Magic link for ${signerEmail}:`, linkData.properties.action_link)
          // TODO: Send real email here later
        }
      } catch (err) {
        console.error('User creation error:', err)
      }
    }
    // === END NEW ===

    // 4. Mark signup as approved
    await supabase
      .from('signups')
      .update({ status: 'approved', client_id: newClient.id })
      .eq('id', signupId)

    return NextResponse.json({ success: true, client: newClient })

  } catch (error: any) {
    console.error('Approve error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
