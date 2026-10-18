package com.ferni.voice.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Where a signed-in person stands in line: the shared waitlist contract
 * (GET /api/waitlist/me, and the body of a 403 { code: "WAITLISTED" } from
 * /token while the gate is on). Lets the app show a waiting screen instead of
 * "Failed to get token".
 */
@Serializable
data class WaitlistStatus(
    val status: String, // waiting | admitted | expired | not_joined
    val position: Int? = null,
    val wavesAway: Int? = null,
    val nextWaveAt: String? = null,
    val referralUrl: String? = null,
    val referrals: Referrals? = null,
    val foundingMember: Boolean = false,
    val foundingWave: Int? = null
) {
    @Serializable
    data class Referrals(val verified: Int = 0, val creditedDays: Int = 0, val max: Int = 5)

    val isAdmitted: Boolean get() = status == "admitted"

    /** The refusal said "waitlisted" without saying where; GET /api/waitlist/me can fill it in. */
    val detailsUnknown: Boolean get() = status == "waiting" && position == null

    /** Only https links go on the share sheet. */
    val inviteUrl: String? get() = referralUrl?.takeIf { it.startsWith("https://") }

    /** "You're #432, about 4 waves away"; null when the position isn't known yet. */
    val positionLine: String?
        get() {
            val place = position?.let { "You’re #$it" } ?: return null
            val waves = wavesAway ?: return place
            return if (waves > 1) "$place, about $waves waves away" else "$place, in the very next wave"
        }

    /** "The next wave opens Thursday, October 22." */
    fun nextWaveLine(zone: TimeZone = TimeZone.getDefault(), locale: Locale = Locale.getDefault()): String? {
        // java.time needs API 26 (minSdk is 24): parse the ISO instant by hand, with or without millis
        val iso = nextWaveAt?.replace(Regex("\\.\\d+Z$"), "Z") ?: return null
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val date = runCatching { parser.parse(iso) }.getOrNull() ?: return null
        val day = SimpleDateFormat("EEEE, MMMM d", locale).apply { timeZone = zone }.format(date)
        return "The next wave opens $day."
    }

    /** "Founding member · Wave 7" */
    val badge: String?
        get() = if (!foundingMember) null else foundingWave?.let { "Founding member · Wave $it" } ?: "Founding member"

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        /**
         * A /token refusal that means "you're in line". The contract sends 403
         * { code: "WAITLISTED", ...details }; the gate's first version sends 403
         * { error: "not_admitted", waitlisted: true } with no details, which
         * reads as waiting, position unknown.
         */
        fun fromRefusal(code: Int, body: String?): WaitlistStatus? {
            if (code != 403 || body == null) return null
            val element = runCatching { json.parseToJsonElement(body).jsonObject }.getOrNull() ?: return null
            if (element.text("code") == "WAITLISTED") return fromMe(body)
            val waitlisted = element.text("error") == "not_admitted" || element.text("waitlisted") == "true"
            return if (waitlisted) WaitlistStatus(status = "waiting") else null
        }

        /** The body of GET /api/waitlist/me (or a contract refusal); null unless waiting or admitted. */
        fun fromMe(body: String?): WaitlistStatus? = body?.let {
            runCatching { json.decodeFromString(serializer(), it) }.getOrNull()
        }?.takeIf { it.status == "waiting" || it.status == "admitted" }

        private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.content
    }
}
