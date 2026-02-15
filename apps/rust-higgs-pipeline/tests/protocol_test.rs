use higgs_voice_pipeline::protocol::*;

#[test]
fn test_start_session_roundtrip() {
    let msg = ClientMessage::StartSession {
        session_id: "sess-001".into(),
        persona: Some("ferni".into()),
    };
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"start_session""#));
    assert!(json.contains(r#""session_id":"sess-001""#));

    let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
    match parsed {
        ClientMessage::StartSession {
            session_id,
            persona,
        } => {
            assert_eq!(session_id, "sess-001");
            assert_eq!(persona, Some("ferni".into()));
        }
        _ => panic!("Expected StartSession"),
    }
}

#[test]
fn test_start_session_no_persona() {
    let json = r#"{"type":"start_session","session_id":"s1","persona":null}"#;
    let parsed: ClientMessage = serde_json::from_str(json).unwrap();
    match parsed {
        ClientMessage::StartSession { persona, .. } => {
            assert!(persona.is_none());
        }
        _ => panic!("Expected StartSession"),
    }
}

#[test]
fn test_transcribe_roundtrip() {
    let msg = ClientMessage::Transcribe;
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"transcribe""#));

    let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
    assert!(matches!(parsed, ClientMessage::Transcribe));
}

#[test]
fn test_synthesize_roundtrip() {
    let msg = ClientMessage::Synthesize {
        text: "Hello world".into(),
        emotion: Some("happy".into()),
        intensity: Some(0.8),
        request_id: Some(42),
    };
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"synthesize""#));
    assert!(json.contains(r#""text":"Hello world""#));

    let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
    match parsed {
        ClientMessage::Synthesize {
            text,
            emotion,
            intensity,
            ..
        } => {
            assert_eq!(text, "Hello world");
            assert_eq!(emotion, Some("happy".into()));
            assert!((intensity.unwrap() - 0.8).abs() < f32::EPSILON);
        }
        _ => panic!("Expected Synthesize"),
    }
}

#[test]
fn test_end_session_roundtrip() {
    let msg = ClientMessage::EndSession;
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"end_session""#));

    let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
    assert!(matches!(parsed, ClientMessage::EndSession));
}

#[test]
fn test_transcript_roundtrip() {
    let msg = ServerMessage::Transcript {
        text: "Hello there".into(),
        biomarkers: Some(VoiceBiomarkers {
            pitch_hz: 120.5,
            energy: 0.6,
            jitter: 0.02,
            shimmer: 0.03,
            breathiness: 0.1,
            speech_rate: 3.5,
            is_speech: true,
        }),
        latency_ms: 42,
    };
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"transcript""#));

    let parsed: ServerMessage = serde_json::from_str(&json).unwrap();
    match parsed {
        ServerMessage::Transcript {
            text,
            biomarkers,
            latency_ms,
        } => {
            assert_eq!(text, "Hello there");
            assert_eq!(latency_ms, 42);
            let bio = biomarkers.unwrap();
            assert!((bio.pitch_hz - 120.5).abs() < f32::EPSILON);
            assert!((bio.jitter - 0.02).abs() < f32::EPSILON);
            assert!(bio.is_speech);
        }
        _ => panic!("Expected Transcript"),
    }
}

#[test]
fn test_transcript_without_biomarkers() {
    let msg = ServerMessage::Transcript {
        text: "test".into(),
        biomarkers: None,
        latency_ms: 10,
    };
    let json = serde_json::to_string(&msg).unwrap();
    let parsed: ServerMessage = serde_json::from_str(&json).unwrap();
    match parsed {
        ServerMessage::Transcript { biomarkers, .. } => {
            assert!(biomarkers.is_none());
        }
        _ => panic!("Expected Transcript"),
    }
}

#[test]
fn test_audio_start_roundtrip() {
    let msg = ServerMessage::AudioStart { sample_rate: 24000, request_id: None };
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"audio_start""#));
    assert!(json.contains(r#""sample_rate":24000"#));

    let parsed: ServerMessage = serde_json::from_str(&json).unwrap();
    match parsed {
        ServerMessage::AudioStart { sample_rate, .. } => {
            assert_eq!(sample_rate, 24000);
        }
        _ => panic!("Expected AudioStart"),
    }
}

#[test]
fn test_audio_done_roundtrip() {
    let msg = ServerMessage::AudioDone {
        duration_ms: 1500,
        humanization: Some(HumanizationInfo {
            stages_applied: vec!["breath".into(), "filler".into()],
            breath_count: 2,
            filler_count: 1,
        }),
        request_id: None,
    };
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"audio_done""#));

    let parsed: ServerMessage = serde_json::from_str(&json).unwrap();
    match parsed {
        ServerMessage::AudioDone {
            duration_ms,
            humanization,
            ..
        } => {
            assert_eq!(duration_ms, 1500);
            let h = humanization.unwrap();
            assert_eq!(h.stages_applied, vec!["breath", "filler"]);
            assert_eq!(h.breath_count, 2);
            assert_eq!(h.filler_count, 1);
        }
        _ => panic!("Expected AudioDone"),
    }
}

#[test]
fn test_error_roundtrip() {
    let msg = ServerMessage::Error {
        code: "no_session".into(),
        message: "No active session".into(),
        request_id: None,
    };
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains(r#""type":"error""#));

    let parsed: ServerMessage = serde_json::from_str(&json).unwrap();
    match parsed {
        ServerMessage::Error { code, message, request_id } => {
            assert_eq!(code, "no_session");
            assert_eq!(message, "No active session");
            assert_eq!(request_id, None);
        }
        _ => panic!("Expected Error"),
    }
}

#[test]
fn test_malformed_json_fails() {
    let result = serde_json::from_str::<ClientMessage>(r#"{"type":"unknown_type"}"#);
    assert!(result.is_err());

    let result = serde_json::from_str::<ClientMessage>(r#"not json"#);
    assert!(result.is_err());
}
