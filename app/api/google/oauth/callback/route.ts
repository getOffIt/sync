import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { storeTokens } from '@/lib/google'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/?error=No authorization code received', request.url))
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(new URL('/?error=Failed to obtain tokens', request.url))
    }

    // Store tokens in database
    await storeTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600000),
      scopes: tokens.scope
    })

    return NextResponse.redirect(new URL('/?success=Google Calendar connected successfully', request.url))
  } catch (error) {
    console.error('OAuth callback error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(errorMessage)}`, request.url))
  }
}
