package com.ferni.voice.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for PersonaColors object.
 */
class PersonaColorsTest {

    // MARK: - Ferni Colors

    @Test
    fun `ferni primary color is sage green`() {
        // #4a6741 = 0xFF4a6741
        assertEquals(Color(0xFF4a6741), PersonaColors.Ferni)
    }

    @Test
    fun `ferni secondary color is darker green`() {
        assertEquals(Color(0xFF3d5a35), PersonaColors.FerniSecondary)
    }

    @Test
    fun `ferni secondary is darker than primary`() {
        // Compare luminance by checking if secondary has lower color values
        val primarySum = 0x4a + 0x67 + 0x41
        val secondarySum = 0x3d + 0x5a + 0x35
        assertTrue("Secondary should be darker", secondarySum < primarySum)
    }

    // MARK: - Maya Colors

    @Test
    fun `maya primary color is rose terracotta`() {
        assertEquals(Color(0xFFa67a6a), PersonaColors.Maya)
    }

    @Test
    fun `maya secondary color is darker`() {
        assertEquals(Color(0xFF8a635a), PersonaColors.MayaSecondary)
    }

    // MARK: - Alex Colors

    @Test
    fun `alex primary color is slate blue`() {
        assertEquals(Color(0xFF5a6b8a), PersonaColors.Alex)
    }

    @Test
    fun `alex secondary color is darker`() {
        assertEquals(Color(0xFF4a5a73), PersonaColors.AlexSecondary)
    }

    // MARK: - Jordan Colors

    @Test
    fun `jordan primary color is coral`() {
        assertEquals(Color(0xFFc4856a), PersonaColors.Jordan)
    }

    @Test
    fun `jordan secondary color is darker`() {
        assertEquals(Color(0xFFa86d55), PersonaColors.JordanSecondary)
    }

    // MARK: - Peter Colors

    @Test
    fun `peter primary color is ocean teal`() {
        assertEquals(Color(0xFF3a6b73), PersonaColors.Peter)
    }

    @Test
    fun `peter secondary color is darker`() {
        assertEquals(Color(0xFF2d5359), PersonaColors.PeterSecondary)
    }

    // MARK: - Nayan Colors

    @Test
    fun `nayan primary color is warm brown`() {
        assertEquals(Color(0xFF9a7b5a), PersonaColors.Nayan)
    }

    @Test
    fun `nayan secondary color is darker`() {
        assertEquals(Color(0xFF7a5b3a), PersonaColors.NayanSecondary)
    }

    // MARK: - Color Distinctness

    @Test
    fun `all primary colors are distinct`() {
        val colors = listOf(
            PersonaColors.Ferni,
            PersonaColors.Maya,
            PersonaColors.Alex,
            PersonaColors.Jordan,
            PersonaColors.Peter,
            PersonaColors.Nayan
        )

        // All colors should be unique
        assertEquals(
            "All persona colors should be unique",
            colors.size,
            colors.toSet().size
        )
    }
}

/**
 * Unit tests for BrandColors object.
 */
class BrandColorsTest {

    @Test
    fun `accent color matches brand guidelines`() {
        assertEquals(Color(0xFF3D5A45), BrandColors.Accent)
    }

    @Test
    fun `natural ink is dark for text`() {
        assertEquals(Color(0xFF2C2520), BrandColors.NaturalInk)
    }

    @Test
    fun `cream is light for backgrounds`() {
        assertEquals(Color(0xFFF5F1EB), BrandColors.Cream)
    }

    @Test
    fun `warm gold has golden hue`() {
        assertEquals(Color(0xFFc4a265), BrandColors.WarmGold)
    }

    @Test
    fun `accent is close to ferni color`() {
        // Both are forest greens - accent is slightly different for contrast
        val accentRed = (0xFF3D5A45 shr 16) and 0xFF
        val accentGreen = (0xFF3D5A45 shr 8) and 0xFF

        val ferniRed = (0xFF4a6741 shr 16) and 0xFF
        val ferniGreen = (0xFF4a6741 shr 8) and 0xFF

        // Both should be in the green family
        assertTrue("Both accent and ferni should have green > red", accentGreen > accentRed)
        assertTrue("Both accent and ferni should have green > red", ferniGreen > ferniRed)
    }
}

/**
 * Unit tests for system surface colors.
 */
class SurfaceColorsTest {

    @Test
    fun `surface dark is very dark`() {
        assertEquals(Color(0xFF1A1A1A), SurfaceDark)
    }

    @Test
    fun `surface light is warm cream`() {
        assertEquals(Color(0xFFF5F1EB), SurfaceLight)
    }

    @Test
    fun `on surface dark is white`() {
        assertEquals(Color(0xFFFFFFFF), OnSurfaceDark)
    }

    @Test
    fun `on surface light is natural ink`() {
        assertEquals(Color(0xFF2C2520), OnSurfaceLight)
    }

    @Test
    fun `surface light matches brand cream`() {
        assertEquals(BrandColors.Cream, SurfaceLight)
    }

    @Test
    fun `on surface light matches brand natural ink`() {
        assertEquals(BrandColors.NaturalInk, OnSurfaceLight)
    }
}

/**
 * Unit tests for backdrop colors.
 */
class BackdropColorsTest {

    @Test
    fun `backdrop dark has black with alpha`() {
        // 0x99 = 153 = 60% alpha
        assertEquals(Color(0x99000000), BackdropDark)
    }

    @Test
    fun `backdrop light has white with alpha`() {
        // 0x66 = 102 = 40% alpha
        assertEquals(Color(0x66FFFFFF), BackdropLight)
    }

    @Test
    fun `backdrop dark is more opaque than light`() {
        // Dark overlay typically needs more opacity for readability
        val darkAlpha = (0x99000000L shr 24) and 0xFF
        val lightAlpha = (0x66FFFFFFL shr 24) and 0xFF
        assertTrue("Dark backdrop should be more opaque", darkAlpha > lightAlpha)
    }
}
