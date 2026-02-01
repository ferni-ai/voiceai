#!/usr/bin/env python3
"""
FTIS V5-860 Router Validation

Validates the trained ONNX model against a comprehensive test suite
covering major tool categories. Uses onnxruntime directly for inference.

Usage:
    python validate.py
    python validate.py --verbose
    python validate.py --category music
    python validate.py --model-dir ../../models/ferni-router-v5-860
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# ============================================================================
# TEST CASES - Using actual tool IDs from label_map.json
# ============================================================================

@dataclass
class TestCase:
    query: str
    expected_tools: list[str]  # At least one should appear in top-5
    category: str

TEST_CASES = [
    # ═══════════════════════════════════════════════════════════════════════════
    # MUSIC & AUDIO (High frequency)
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("play some jazz music", ["playMusic", "music_play", "spotify_play", "playMoodMusic", "playSonosMusic"], "music"),
    TestCase("turn up the volume", ["adjustVolume", "musicControl", "setSonosVolume"], "music"),
    TestCase("skip this song", ["skipTrack", "musicControl"], "music"),
    TestCase("what song is this", ["musicInfo", "findSong", "whatsSonosPlaying", "musicControl"], "music"),
    TestCase("add this to my playlist", ["musicControl", "playMusic", "searchMusic"], "music"),
    TestCase("play something relaxing", ["playMoodMusic", "playMusic", "toggleAmbientMode", "music_play"], "music"),
    TestCase("shuffle my liked songs", ["playMusic", "musicControl", "spotify_play", "music_play"], "music"),
    TestCase("pause the music", ["pauseMusic", "musicControl", "pauseSonos"], "music"),

    # ═══════════════════════════════════════════════════════════════════════════
    # CALENDAR & SCHEDULING
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("schedule a meeting tomorrow at 2pm", ["createCalendarEvent", "scheduleEvent", "calendarArchitecture"], "calendar"),
    TestCase("what's on my calendar today", ["getCalendarEvents", "getDailyBriefing", "morningBriefing"], "calendar"),
    TestCase("cancel my 3pm appointment", ["cancelEvent", "cancelScheduled", "modifyEvent"], "calendar"),
    TestCase("reschedule the dentist to next week", ["rescheduleEvent", "modifyEvent", "cancelEvent"], "calendar"),
    TestCase("block off Friday afternoon", ["createCalendarEvent", "scheduleEvent", "calendarArchitecture"], "calendar"),
    TestCase("when is my next meeting", ["getCalendarEvents", "checkAvailability", "getDailyBriefing"], "calendar"),
    TestCase("set up a recurring standup", ["createCalendarEvent", "scheduleEvent"], "calendar"),

    # ═══════════════════════════════════════════════════════════════════════════
    # WEATHER
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("will it rain today", ["getWeather", "getWeatherForecast", "weatherForecast"], "weather"),
    TestCase("what's the temperature outside", ["getWeather", "getWeatherForecast", "weatherForecast"], "weather"),
    TestCase("weather forecast for the weekend", ["getWeatherForecast", "weatherForecast", "getWeather"], "weather"),
    TestCase("should I bring an umbrella", ["getWeather", "getWeatherForecast", "weatherForecast"], "weather"),
    TestCase("how hot will it be tomorrow", ["getWeatherForecast", "getWeather", "weatherForecast"], "weather"),

    # ═══════════════════════════════════════════════════════════════════════════
    # COMMUNICATION (SMS, Email, Calls)
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("send a text to mom", ["sendSMS", "sendMessage", "textContact", "sendMessageNow"], "communication"),
    TestCase("call John", ["callContact", "makeCall", "callAndConverse", "backgroundCall"], "communication"),
    TestCase("read my messages", ["analyzeMessage", "analyzeInboxPriority", "summarizeThread", "__no_tool__"], "communication"),
    TestCase("send an email to the team", ["sendEmail", "composeEmail", "scheduleEmail"], "communication"),
    TestCase("check my inbox", ["analyzeInboxPriority", "analyzeMessage", "sendEmail", "__no_tool__"], "communication"),
    TestCase("reply to Sarah's email", ["sendEmail", "composeEmail", "difficultEmailDraft"], "communication"),
    TestCase("forward this to my boss", ["sendEmail", "composeEmail"], "communication"),

    # ═══════════════════════════════════════════════════════════════════════════
    # SMART HOME
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("turn off the lights", ["controlLights", "controlLight", "setLights"], "smart_home"),
    TestCase("set thermostat to 72 degrees", ["setThermostat", "adjustTemperature"], "smart_home"),
    TestCase("lock the front door", ["controlLock"], "smart_home"),
    TestCase("dim the bedroom lights", ["controlLights", "controlLight", "setLights"], "smart_home"),
    TestCase("turn on the fan", ["controlLights", "listDevices", "activateScene", "__no_tool__"], "smart_home"),
    TestCase("is the garage door open", ["controlLock", "listDevices", "__no_tool__"], "smart_home"),
    TestCase("arm the security system", ["controlLock", "createAutomation", "__no_tool__"], "smart_home"),

    # ═══════════════════════════════════════════════════════════════════════════
    # HEALTH & FITNESS
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("log my workout", ["logExercise", "trackWorkout", "trackFitnessGoal", "suggestWorkout"], "health"),
    TestCase("how many steps today", ["trackFitnessGoal", "logExercise", "assessEnergyLevel", "__no_tool__"], "health"),
    TestCase("start a run", ["logExercise", "suggestWorkout", "trackWorkout", "trackFitnessGoal"], "health"),
    TestCase("log 8 glasses of water", ["logWater", "trackHydration"], "health"),
    TestCase("how did I sleep last night", ["trackSleep", "logSleep", "analyzeSleepPattern", "suggestSleepHygiene"], "health"),
    TestCase("set a meditation timer", ["createTimer", "setTimer", "walkingMeditation", "breatheWithMe"], "health"),
    TestCase("track my weight", ["trackFitnessGoal", "logExercise", "trackWorkout", "bodyNeutrality"], "health"),

    # ═══════════════════════════════════════════════════════════════════════════
    # TASKS & REMINDERS
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("add milk to my shopping list", ["generateShoppingList", "addTask", "createTodo", "orderGroceries"], "tasks"),
    TestCase("remind me to call mom at 5pm", ["createReminder", "setReminder", "scheduleReminder"], "tasks"),
    TestCase("what's on my todo list", ["listTodos", "getTasks", "getPriorities"], "tasks"),
    TestCase("mark groceries as done", ["markDone", "completeTask", "markHabitComplete"], "tasks"),
    TestCase("set a reminder for my meeting", ["createReminder", "setReminder", "scheduleReminder"], "tasks"),
    TestCase("delete the dentist reminder", ["cancelReminder", "listReminders"], "tasks"),

    # ═══════════════════════════════════════════════════════════════════════════
    # NAVIGATION & TRAVEL
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("directions to the airport", ["getCommuteTime", "search", "findBusiness", "__no_tool__"], "navigation"),
    TestCase("how long to get to work", ["getCommuteTime", "__no_tool__"], "navigation"),
    TestCase("find a gas station nearby", ["findBusiness", "searchLocalBusinesses", "findRestaurants"], "navigation"),
    TestCase("book a flight to New York", ["searchFlights", "getFlightPrice", "planTrip"], "navigation"),
    TestCase("find hotels in San Francisco", ["searchHotels", "requestHotelQuotes", "planTrip"], "navigation"),

    # ═══════════════════════════════════════════════════════════════════════════
    # KNOWLEDGE & SEARCH
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("what's the latest news", ["getNews", "headlines", "search", "webSearch"], "knowledge"),
    TestCase("search for pasta recipes", ["searchRecipes", "search", "webSearch"], "knowledge"),
    TestCase("who won the game last night", ["getSports", "getNews", "headlines", "search"], "knowledge"),
    TestCase("translate hello to Spanish", ["search", "webSearch", "explainConcept", "__no_tool__"], "knowledge"),
    TestCase("define serendipity", ["explainConcept", "search", "webSearch", "__no_tool__"], "knowledge"),
    TestCase("how tall is Mount Everest", ["search", "webSearch", "explainConcept", "__no_tool__"], "knowledge"),

    # ═══════════════════════════════════════════════════════════════════════════
    # ENTERTAINMENT
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("tell me a joke", ["becomeSilly", "startGame", "__no_tool__", "cultivatePlayfulness"], "entertainment"),
    TestCase("what's trending on YouTube", ["getTrendingVideos", "searchYouTube", "getVideoRecommendations"], "entertainment"),
    TestCase("read me a bedtime story", ["captureLifeStory", "__no_tool__", "familyStoryPrompts"], "entertainment"),

    # ═══════════════════════════════════════════════════════════════════════════
    # SYSTEM & DEVICE
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("set an alarm for 7am", ["createAlarm", "setAlarm"], "system"),
    TestCase("what time is it", ["getDailyBriefing", "__no_tool__", "morningBriefing"], "system"),
    TestCase("turn on do not disturb", ["setQuietHours", "notificationDetox", "phoneFreeTime"], "system"),
    TestCase("set a timer for 10 minutes", ["createTimer", "setTimer"], "system"),

    # ═══════════════════════════════════════════════════════════════════════════
    # SOCIAL & CONTACTS
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("what's John's phone number", ["manageContact", "lookup", "lookupBusinessByPhone", "saveContactInfo"], "social"),
    TestCase("add a new contact", ["manageContact", "saveContactInfo"], "social"),
    TestCase("when is Sarah's birthday", ["getUpcomingBirthdays", "setBirthday", "manageContact"], "social"),
    TestCase("post to LinkedIn", ["postToLinkedIn", "generateSocialContent", "postToTwitter"], "social"),

    # ═══════════════════════════════════════════════════════════════════════════
    # PRODUCTIVITY
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("create a new document", ["saveDocument", "findDocument", "organizeDocuments", "createProject"], "productivity"),
    TestCase("take a note", ["storeInfo", "saveMemory", "rememberThis", "logReflection"], "productivity"),
    TestCase("find my tax documents", ["findDocument", "locateDocument", "searchFiles", "organizeDocuments"], "productivity"),

    # ═══════════════════════════════════════════════════════════════════════════
    # OPEN INTENT (Should route to __no_tool__)
    # ═══════════════════════════════════════════════════════════════════════════
    TestCase("how are you doing today", ["__no_tool__"], "open_intent"),
    TestCase("tell me about yourself", ["__no_tool__"], "open_intent"),
    TestCase("I'm feeling stressed", ["__no_tool__", "deEscalateAnxiety", "calmingTechnique", "groundingExercise", "breatheWithMe"], "open_intent"),
    TestCase("what do you think about AI", ["__no_tool__"], "open_intent"),
    TestCase("good morning", ["__no_tool__", "morningBriefing", "getDailyBriefing"], "open_intent"),
    TestCase("I had a great day", ["__no_tool__", "celebrateTinyWin", "noticeJoy"], "open_intent"),
]


# ============================================================================
# ONNX INFERENCE
# ============================================================================

class OnnxValidator:
    """Loads ONNX model and runs inference for validation."""

    def __init__(self, model_dir: str, use_int8: bool = False):
        import onnxruntime as ort
        from transformers import AutoTokenizer

        self.model_dir = model_dir

        # Load label map
        label_map_path = os.path.join(model_dir, "label_map.json")
        with open(label_map_path) as f:
            self.label_map = json.load(f)
        # Invert: index -> tool_id
        self.index_to_label = {v: k for k, v in self.label_map.items()}
        self.num_labels = len(self.label_map)

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, trust_remote_code=True)

        # Load ONNX model
        model_file = "model_int8.onnx" if use_int8 else "model.onnx"
        model_path = os.path.join(model_dir, model_file)
        if not os.path.exists(model_path):
            # Fall back to the other variant
            model_file = "model.onnx" if use_int8 else "model_int8.onnx"
            model_path = os.path.join(model_dir, model_file)

        print(f"  Loading model: {model_file} ({self.num_labels} labels)")

        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = 4

        self.session = ort.InferenceSession(model_path, sess_options, providers=["CPUExecutionProvider"])

        # Warmup
        self._warmup()

    def _warmup(self):
        """Run a warmup inference to avoid cold-start latency."""
        self.predict("hello world", top_k=1)

    def predict(self, query: str, top_k: int = 5) -> list[dict]:
        """Run inference and return top-k predictions with confidence scores."""
        # Tokenize
        inputs = self.tokenizer(
            query,
            return_tensors="np",
            max_length=128,
            truncation=True,
            padding="max_length",
        )

        # Run inference
        start = time.perf_counter()
        outputs = self.session.run(
            None,
            {
                "input_ids": inputs["input_ids"].astype(np.int64),
                "attention_mask": inputs["attention_mask"].astype(np.int64),
            },
        )
        latency_ms = (time.perf_counter() - start) * 1000

        # Apply softmax
        logits = outputs[0][0]  # Shape: (num_labels,)
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / exp_logits.sum()

        # Get top-k
        top_indices = np.argsort(probs)[::-1][:top_k]
        predictions = []
        for idx in top_indices:
            tool_id = self.index_to_label.get(int(idx), f"unknown_{idx}")
            predictions.append({
                "tool_id": tool_id,
                "confidence": float(probs[idx]),
                "latency_ms": latency_ms,
            })

        return predictions


# ============================================================================
# VALIDATION RUNNER
# ============================================================================

@dataclass
class TestResult:
    query: str
    category: str
    passed: bool
    expected_tools: list[str]
    actual_tools: list[str]
    top_score: float
    latency_ms: float

@dataclass
class CategoryStats:
    passed: int = 0
    failed: int = 0
    total: int = 0

    @property
    def pass_rate(self) -> float:
        return (self.passed / self.total * 100) if self.total > 0 else 0.0


def run_validation(
    model_dir: str,
    verbose: bool = False,
    category_filter: str | None = None,
    use_int8: bool = False,
):
    print("═" * 67)
    print("  FTIS V5-860 Router Validation (ONNX Direct)")
    print("═" * 67)
    print(f"  Model dir:       {model_dir}")
    print(f"  Test cases:      {len(TEST_CASES)}")
    print(f"  Category filter: {category_filter or 'all'}")
    print(f"  Model variant:   {'int8' if use_int8 else 'float32'}")
    print("═" * 67)
    print()

    # Initialize the model
    print("  Initializing ONNX model...")
    try:
        validator = OnnxValidator(model_dir, use_int8=use_int8)
    except Exception as e:
        print(f"\n❌ Failed to load model: {e}")
        sys.exit(1)
    print(f"  Model loaded ({validator.num_labels} labels)\n")

    # Filter test cases
    test_cases = TEST_CASES
    if category_filter:
        test_cases = [tc for tc in TEST_CASES if tc.category == category_filter]
        if not test_cases:
            print(f"❌ No test cases found for category '{category_filter}'")
            sys.exit(1)

    results: list[TestResult] = []
    category_stats: dict[str, CategoryStats] = {}
    total_latency = 0.0

    for tc in test_cases:
        try:
            predictions = validator.predict(tc.query, top_k=5)
            top_tools = [p["tool_id"] for p in predictions]
            top_score = predictions[0]["confidence"] if predictions else 0.0
            latency = predictions[0]["latency_ms"] if predictions else 0.0
            total_latency += latency

            # Check if any expected tool appears in top-5
            passed = any(exp in top_tools for exp in tc.expected_tools)

            result = TestResult(
                query=tc.query,
                category=tc.category,
                passed=passed,
                expected_tools=tc.expected_tools,
                actual_tools=top_tools,
                top_score=top_score,
                latency_ms=latency,
            )
            results.append(result)

            # Update category stats
            if tc.category not in category_stats:
                category_stats[tc.category] = CategoryStats()
            category_stats[tc.category].total += 1
            if passed:
                category_stats[tc.category].passed += 1
            else:
                category_stats[tc.category].failed += 1

            # Print result
            if verbose or not passed:
                icon = "✅" if passed else "❌"
                print(f"{icon} [{tc.category}] \"{tc.query}\"")
                if not passed or verbose:
                    print(f"   Expected: {', '.join(tc.expected_tools)}")
                    actual_str = ", ".join(f"{t} ({predictions[i]['confidence']:.3f})" for i, t in enumerate(top_tools))
                    print(f"   Actual:   {actual_str}")
                    print(f"   Latency:  {latency:.1f}ms")
            elif passed:
                sys.stdout.write(".")
                sys.stdout.flush()

        except Exception as e:
            print(f"❌ Error testing \"{tc.query}\": {e}")
            results.append(TestResult(
                query=tc.query,
                category=tc.category,
                passed=False,
                expected_tools=tc.expected_tools,
                actual_tools=[],
                top_score=0.0,
                latency_ms=0.0,
            ))

    # Calculate stats
    total_passed = sum(1 for r in results if r.passed)
    total_tests = len(results)
    pass_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0.0
    avg_latency = (total_latency / total_tests) if total_tests > 0 else 0.0

    # Print summary
    print("\n")
    print("═" * 67)
    print("  SUMMARY")
    print("═" * 67)
    print(f"  Total:      {total_passed}/{total_tests} passed ({pass_rate:.1f}%)")
    print(f"  Avg Latency: {avg_latency:.1f}ms")
    print()
    print("  By Category:")

    sorted_cats = sorted(category_stats.items(), key=lambda x: -x[1].pass_rate)
    for cat_name, stats in sorted_cats:
        bar_filled = round(stats.pass_rate / 5)
        bar_empty = 20 - bar_filled
        bar = "█" * bar_filled + "░" * bar_empty
        icon = "✅" if stats.pass_rate >= 80 else ("⚠️ " if stats.pass_rate >= 60 else "❌")
        print(f"  {icon} {cat_name:<15} {bar} {stats.pass_rate:.0f}% ({stats.passed}/{stats.total})")

    print("═" * 67)

    # Print failures for review
    failures = [r for r in results if not r.passed]
    if failures:
        print(f"\n  ❌ FAILURES ({len(failures)}):")
        for f in failures:
            print(f"     [{f.category}] \"{f.query}\"")
            print(f"       Expected: {', '.join(f.expected_tools)}")
            print(f"       Got:      {', '.join(f.actual_tools)}")

    # Pass/fail
    PASS_THRESHOLD = 80
    if pass_rate < PASS_THRESHOLD:
        print(f"\n❌ FAILED: Pass rate {pass_rate:.1f}% is below threshold {PASS_THRESHOLD}%")
        sys.exit(1)
    else:
        print(f"\n✅ PASSED: Pass rate {pass_rate:.1f}% meets threshold {PASS_THRESHOLD}%")

    # Write results to JSON
    results_path = os.path.join(os.path.dirname(__file__), "validation_results.json")
    with open(results_path, "w") as f:
        json.dump({
            "pass_rate": pass_rate,
            "total_passed": total_passed,
            "total_tests": total_tests,
            "avg_latency_ms": avg_latency,
            "model_dir": model_dir,
            "failures": [
                {
                    "query": r.query,
                    "category": r.category,
                    "expected": r.expected_tools,
                    "actual": r.actual_tools,
                    "top_score": r.top_score,
                }
                for r in results if not r.passed
            ],
            "category_stats": {
                cat: {"passed": s.passed, "failed": s.failed, "total": s.total, "pass_rate": s.pass_rate}
                for cat, s in category_stats.items()
            },
        }, f, indent=2)
    print(f"\n  Results saved to: {results_path}")


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FTIS V5-860 Router Validation")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show all results")
    parser.add_argument("--category", "-c", type=str, help="Filter by category")
    parser.add_argument("--model-dir", type=str, help="Path to model directory")
    parser.add_argument("--int8", action="store_true", help="Use int8 quantized model")
    args = parser.parse_args()

    # Determine model directory
    if args.model_dir:
        model_dir = args.model_dir
    else:
        # Try production path first, then local training output
        script_dir = Path(__file__).parent
        project_root = script_dir.parent.parent.parent  # apps/ml-training/router -> project root
        prod_path = project_root / "models" / "ferni-router-v5-860"
        local_path = script_dir / "outputs" / "ferni-router-v5-860" / "final"

        if prod_path.exists() and (prod_path / "model.onnx").exists():
            model_dir = str(prod_path)
        elif (prod_path / "model_int8.onnx").exists():
            model_dir = str(prod_path)
        elif local_path.exists():
            model_dir = str(local_path)
        else:
            print(f"❌ Model not found at:")
            print(f"   {prod_path}")
            print(f"   {local_path}")
            print(f"\nUse --model-dir to specify the path.")
            sys.exit(1)

    run_validation(model_dir, verbose=args.verbose, category_filter=args.category, use_int8=args.int8)
