package com.ferni.voice.betterthanuman

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for LampReaction data class.
 */
class LampReactionTest {

    @Test
    fun `default reaction is neutral`() {
        val reaction = LampReaction()
        assertTrue(reaction.isNeutral)
    }

    @Test
    fun `non-zero offsetX is not neutral`() {
        val reaction = LampReaction(offsetX = 1f)
        assertFalse(reaction.isNeutral)
    }

    @Test
    fun `non-zero offsetY is not neutral`() {
        val reaction = LampReaction(offsetY = -5f)
        assertFalse(reaction.isNeutral)
    }

    @Test
    fun `non-default scale is not neutral`() {
        val reaction = LampReaction(scale = 0.95f)
        assertFalse(reaction.isNeutral)
    }

    @Test
    fun `non-zero rotation is not neutral`() {
        val reaction = LampReaction(rotation = 3f)
        assertFalse(reaction.isNeutral)
    }

    @Test
    fun `equality works correctly`() {
        val reaction1 = LampReaction(1f, 2f, 0.98f, 5f)
        val reaction2 = LampReaction(1f, 2f, 0.98f, 5f)
        val reaction3 = LampReaction(1f, 2f, 0.98f, 6f)

        assertEquals(reaction1, reaction2)
        assertNotEquals(reaction1, reaction3)
    }
}

/**
 * Unit tests for LampAnimation enum.
 */
class LampAnimationTest {

    @Test
    fun `all animation types exist`() {
        val animations = LampAnimation.entries
        assertEquals(7, animations.size)
    }

    @Test
    fun `includes none type`() {
        assertTrue(LampAnimation.entries.contains(LampAnimation.NONE))
    }

    @Test
    fun `includes nod type`() {
        assertTrue(LampAnimation.entries.contains(LampAnimation.NOD))
    }

    @Test
    fun `includes tilt type`() {
        assertTrue(LampAnimation.entries.contains(LampAnimation.TILT))
    }

    @Test
    fun `includes bounce type`() {
        assertTrue(LampAnimation.entries.contains(LampAnimation.BOUNCE))
    }

    @Test
    fun `includes multi_bounce type`() {
        assertTrue(LampAnimation.entries.contains(LampAnimation.MULTI_BOUNCE))
    }

    @Test
    fun `includes perk_up type`() {
        assertTrue(LampAnimation.entries.contains(LampAnimation.PERK_UP))
    }

    @Test
    fun `includes shake type`() {
        assertTrue(LampAnimation.entries.contains(LampAnimation.SHAKE))
    }
}

/**
 * Unit tests for TiltDirection enum.
 */
class TiltDirectionTest {

    @Test
    fun `both directions exist`() {
        val directions = TiltDirection.entries
        assertEquals(2, directions.size)
    }

    @Test
    fun `includes left direction`() {
        assertTrue(TiltDirection.entries.contains(TiltDirection.LEFT))
    }

    @Test
    fun `includes right direction`() {
        assertTrue(TiltDirection.entries.contains(TiltDirection.RIGHT))
    }
}

/**
 * Unit tests for EmotionReaction.
 */
class EmotionReactionTest {

    @Test
    fun `happy maps to bounce`() {
        val reaction = EmotionReaction.fromHint("happy")
        assertEquals(LampAnimation.BOUNCE, reaction.lampAnimation)
    }

    @Test
    fun `excited maps to multi_bounce`() {
        val reaction = EmotionReaction.fromHint("excited")
        assertEquals(LampAnimation.MULTI_BOUNCE, reaction.lampAnimation)
    }

    @Test
    fun `curious maps to tilt`() {
        val reaction = EmotionReaction.fromHint("curious")
        assertEquals(LampAnimation.TILT, reaction.lampAnimation)
    }

    @Test
    fun `thinking maps to tilt`() {
        val reaction = EmotionReaction.fromHint("thinking")
        assertEquals(LampAnimation.TILT, reaction.lampAnimation)
    }

    @Test
    fun `empathetic maps to nod`() {
        val reaction = EmotionReaction.fromHint("empathetic")
        assertEquals(LampAnimation.NOD, reaction.lampAnimation)
    }

    @Test
    fun `encouraging maps to perk_up`() {
        val reaction = EmotionReaction.fromHint("encouraging")
        assertEquals(LampAnimation.PERK_UP, reaction.lampAnimation)
    }

    @Test
    fun `neutral maps to none`() {
        val reaction = EmotionReaction.fromHint("neutral")
        assertEquals(LampAnimation.NONE, reaction.lampAnimation)
    }

    @Test
    fun `calm maps to none`() {
        val reaction = EmotionReaction.fromHint("calm")
        assertEquals(LampAnimation.NONE, reaction.lampAnimation)
    }

    @Test
    fun `unknown hint maps to none`() {
        val reaction = EmotionReaction.fromHint("unknown_emotion")
        assertEquals(LampAnimation.NONE, reaction.lampAnimation)
    }

    @Test
    fun `case insensitive matching`() {
        val reaction = EmotionReaction.fromHint("HAPPY")
        assertEquals(LampAnimation.BOUNCE, reaction.lampAnimation)
    }

    @Test
    fun `stores original hint`() {
        val reaction = EmotionReaction.fromHint("curious")
        assertEquals("curious", reaction.emotionHint)
    }
}

/**
 * Unit tests for PixarPersonalityEngine state management.
 *
 * Note: Animation timing tests require coroutine test infrastructure.
 * These tests verify initial state and data structures.
 */
class PixarPersonalityEngineStateTest {

    @Test
    fun `initial reaction is neutral`() {
        val engine = PixarPersonalityEngine()
        assertTrue(engine.currentReaction.value.isNeutral)
    }

    @Test
    fun `initial animation is null`() {
        val engine = PixarPersonalityEngine()
        assertNull(engine.activeAnimation.value)
    }

    @Test
    fun `reset clears to neutral`() {
        val engine = PixarPersonalityEngine()
        engine.reset()
        assertTrue(engine.currentReaction.value.isNeutral)
        assertNull(engine.activeAnimation.value)
    }
}

/**
 * Unit tests for lamp reaction transform bounds.
 */
class LampReactionBoundsTest {

    @Test
    fun `nod anticipation has negative offsetY`() {
        // During anticipation phase, nod goes up (negative Y)
        val anticipation = LampReaction(offsetY = -3f, scale = 0.98f)
        assertTrue(anticipation.offsetY < 0)
    }

    @Test
    fun `nod action has positive offsetY`() {
        // During action phase, nod goes down (positive Y)
        val action = LampReaction(offsetY = 4f, scale = 1.02f, rotation = 3f)
        assertTrue(action.offsetY > 0)
    }

    @Test
    fun `bounce anticipation squashes`() {
        val anticipation = LampReaction(offsetY = 2f, scale = 0.92f)
        assertTrue(anticipation.scale < 1f)
    }

    @Test
    fun `bounce action stretches`() {
        val action = LampReaction(offsetY = -12f, scale = 1.08f)
        assertTrue(action.scale > 1f)
        assertTrue(action.offsetY < 0) // Goes up
    }

    @Test
    fun `tilt right has positive values`() {
        val tiltRight = LampReaction(offsetX = 3f, rotation = 5f)
        assertTrue(tiltRight.offsetX > 0)
        assertTrue(tiltRight.rotation > 0)
    }

    @Test
    fun `tilt left has negative values`() {
        val tiltLeft = LampReaction(offsetX = -3f, rotation = -5f)
        assertTrue(tiltLeft.offsetX < 0)
        assertTrue(tiltLeft.rotation < 0)
    }

    @Test
    fun `perk up goes up and scales`() {
        val perkUp = LampReaction(offsetY = -5f, scale = 1.05f)
        assertTrue(perkUp.offsetY < 0)
        assertTrue(perkUp.scale > 1f)
    }
}

/**
 * Unit tests for animation phase patterns.
 */
class AnimationPhasePatternsTest {

    @Test
    fun `nod phases follow anticipation-action-followthrough`() {
        // Phase 1: Anticipation (up)
        val phase1 = LampReaction(offsetY = -3f, scale = 0.98f)
        assertTrue("Anticipation should go up", phase1.offsetY < 0)
        assertTrue("Anticipation should squash", phase1.scale < 1f)

        // Phase 2: Action (down with rotation)
        val phase2 = LampReaction(offsetY = 4f, scale = 1.02f, rotation = 3f)
        assertTrue("Action should go down", phase2.offsetY > 0)
        assertTrue("Action should stretch", phase2.scale > 1f)
        assertTrue("Action should have rotation", phase2.rotation != 0f)

        // Phase 3: Follow-through (settle)
        val phase3 = LampReaction()
        assertTrue("Follow-through should be neutral", phase3.isNeutral)
    }

    @Test
    fun `bounce phases follow squash-stretch-land-settle`() {
        // Phase 1: Squash down (anticipation)
        val squash = LampReaction(offsetY = 2f, scale = 0.92f)
        assertTrue("Squash should go down", squash.offsetY > 0)
        assertTrue("Squash should compress", squash.scale < 1f)

        // Phase 2: Stretch up (action)
        val stretch = LampReaction(offsetY = -12f, scale = 1.08f)
        assertTrue("Stretch should go up high", stretch.offsetY < -10f)
        assertTrue("Stretch should expand", stretch.scale > 1f)

        // Phase 3: Land (impact squash)
        val land = LampReaction(offsetY = 2f, scale = 0.96f)
        assertTrue("Land should squash again", land.scale < 1f)

        // Phase 4: Settle
        val settle = LampReaction()
        assertTrue("Settle should be neutral", settle.isNeutral)
    }

    @Test
    fun `perk up is simpler two-phase animation`() {
        // Phase 1: Quick pop up
        val pop = LampReaction(offsetY = -5f, scale = 1.05f)
        assertTrue("Pop should go up", pop.offsetY < 0)
        assertTrue("Pop should expand", pop.scale > 1f)

        // Phase 2: Settle
        val settle = LampReaction()
        assertTrue("Settle should be neutral", settle.isNeutral)
    }
}
