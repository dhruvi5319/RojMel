import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/** Public routes. Everything else needs a signed-in profile. */
const PUBLIC = ['/login', '/auth', '/setup']

/** True once both Supabase values are real rather than the example ones. */
export function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return Boolean(
    url && key && !url.includes('placeholder') && !key.includes('placeholder'),
  )
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Before the project is wired up there is nothing to authenticate against;
  // send people to the setup page rather than to a network error.
  if (!isConfigured()) {
    if (request.nextUrl.pathname === '/setup') return response
    const url = request.nextUrl.clone()
    url.pathname = '/setup'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not put anything between createServerClient and getUser: it refreshes
  // the auth token, and skipping it logs people out at random.
  // A dropped connection must not lock everyone out of the pump's books, so a
  // failed lookup is treated as "not signed in" rather than thrown.
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    user = null
  }

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/setup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
