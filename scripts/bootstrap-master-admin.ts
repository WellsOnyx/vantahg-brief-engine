import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function bootstrapMasterAdmin() {
  const masterEmail = 'jonah@wellsonyx.com';

  console.log(`Bootstrapping master admin: ${masterEmail}`);

  // 1. Get or create the user
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw userError;

  let user = userData.users.find(u => u.email === masterEmail);

  if (!user) {
    console.log('User not found — creating new user...');
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: masterEmail,
      email_confirm: true,
      user_metadata: { full_name: 'Jonah Manning' }
    });
    if (createError) throw createError;
    user = newUser.user;
  }

  if (!user) throw new Error('Failed to get or create user');

  // 2. Upsert full master roles
  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert({
      id: user.id,
      email: masterEmail,
      full_name: 'Jonah Manning',
      role: 'admin',
      roles: ['admin', 'builder', 'ceo'],
      is_master: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

  if (profileError) throw profileError;

  console.log('✅ Master admin bootstrapped successfully with full roles:');
  console.log('   - role: admin');
  console.log('   - roles: ["admin", "builder", "ceo"]');
  console.log('   - is_master: true');
}

bootstrapMasterAdmin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Bootstrap failed:', err);
    process.exit(1);
  });
