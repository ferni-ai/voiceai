package com.ferni.voice.models

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone
import java.util.Locale

/** The 403 WAITLISTED body from /token, read into what the waiting screen shows. */
class WaitlistStatusTest {
    private val waiting = """{"code":"WAITLISTED","status":"waiting","position":432,"wavesAway":4,
        "nextWaveAt":"2026-10-22T17:00:00.000Z","referralUrl":"https://ferni.ai/?ref=abc123",
        "referrals":{"verified":1,"creditedDays":3,"max":5},"admittedAt":null,"seatExpiresAt":null,
        "foundingMember":false,"foundingWave":null}"""

    @Test
    fun `403 WAITLISTED gives position, waves, next wave and invite link`() {
        val status = WaitlistStatus.fromRefusal(403, waiting)!!
        assertEquals("You’re #432 — about 4 waves away", status.positionLine)
        assertEquals("The next wave opens Thursday, October 22.", status.nextWaveLine(TimeZone.getTimeZone("UTC"), Locale.US))
        assertEquals("https://ferni.ai/?ref=abc123", status.inviteUrl)
        assertEquals(3, status.referrals?.creditedDays)
    }

    @Test
    fun `other refusals are not the waitlist`() {
        assertNull(WaitlistStatus.fromRefusal(401, waiting))
        assertNull(WaitlistStatus.fromRefusal(403, """{"error":"not_admitted","waitlisted":true}"""))
        assertNull(WaitlistStatus.fromRefusal(403, "not json"))
        assertNull(WaitlistStatus.fromRefusal(403, null))
    }

    @Test
    fun `admitted shows the founding badge with the wave and drops non-https links`() {
        val body = """{"code":"WAITLISTED","status":"admitted","referralUrl":"javascript:x",
            "foundingMember":true,"foundingWave":7}"""
        val status = WaitlistStatus.fromRefusal(403, body)!!
        assertTrue(status.isAdmitted)
        assertEquals("Founding member · Wave 7", status.badge)
        assertNull(status.inviteUrl)
    }

    @Test
    fun `one wave away reads as the very next wave`() {
        val body = """{"code":"WAITLISTED","status":"waiting","position":12,"wavesAway":1}"""
        assertEquals("You’re #12 — you’re in the very next wave", WaitlistStatus.fromRefusal(403, body)!!.positionLine)
    }
}
