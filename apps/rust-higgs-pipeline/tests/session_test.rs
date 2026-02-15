use higgs_voice_pipeline::session::SessionManager;

#[test]
fn test_create_session() {
    let mut mgr = SessionManager::new();
    assert_eq!(mgr.session_count(), 0);

    assert!(mgr.create_session("s1".into(), "ferni".into()));
    assert_eq!(mgr.session_count(), 1);
}

#[test]
fn test_create_duplicate_session_fails() {
    let mut mgr = SessionManager::new();
    assert!(mgr.create_session("s1".into(), "ferni".into()));
    assert!(!mgr.create_session("s1".into(), "maya".into()));
    assert_eq!(mgr.session_count(), 1);
}

#[test]
fn test_get_session() {
    let mut mgr = SessionManager::new();
    mgr.create_session("s1".into(), "ferni".into());

    let session = mgr.get_session("s1").unwrap();
    assert_eq!(session.session_id, "s1");
    assert_eq!(session.persona, "ferni");
    assert_eq!(session.total_transcriptions, 0);
    assert_eq!(session.total_syntheses, 0);

    assert!(mgr.get_session("nonexistent").is_none());
}

#[test]
fn test_get_session_mut() {
    let mut mgr = SessionManager::new();
    mgr.create_session("s1".into(), "ferni".into());

    let session = mgr.get_session_mut("s1").unwrap();
    session.total_transcriptions = 5;

    assert_eq!(mgr.get_session("s1").unwrap().total_transcriptions, 5);
}

#[test]
fn test_remove_session() {
    let mut mgr = SessionManager::new();
    mgr.create_session("s1".into(), "ferni".into());
    assert_eq!(mgr.session_count(), 1);

    let removed = mgr.remove_session("s1");
    assert!(removed.is_some());
    assert_eq!(removed.unwrap().session_id, "s1");
    assert_eq!(mgr.session_count(), 0);

    assert!(mgr.remove_session("s1").is_none());
}

#[test]
fn test_append_audio() {
    let mut mgr = SessionManager::new();
    mgr.create_session("s1".into(), "ferni".into());

    let samples: Vec<i16> = vec![100, -200, 300];
    assert_eq!(mgr.append_audio("s1", &samples), Some(0));

    let session = mgr.get_session("s1").unwrap();
    assert_eq!(session.audio_buffer.len(), 3);
    assert_eq!(session.audio_buffer, vec![100, -200, 300]);

    // Append more
    assert_eq!(mgr.append_audio("s1", &[400, 500]), Some(0));
    let session = mgr.get_session("s1").unwrap();
    assert_eq!(session.audio_buffer.len(), 5);
}

#[test]
fn test_append_audio_nonexistent_session() {
    let mut mgr = SessionManager::new();
    assert!(mgr.append_audio("nonexistent", &[1, 2, 3]).is_none());
}

#[test]
fn test_drain_audio() {
    let mut mgr = SessionManager::new();
    mgr.create_session("s1".into(), "ferni".into());
    mgr.append_audio("s1", &[10, 20, 30]);

    let drained = mgr.drain_audio("s1").unwrap();
    assert_eq!(drained, vec![10, 20, 30]);

    // Buffer should now be empty
    let session = mgr.get_session("s1").unwrap();
    assert!(session.audio_buffer.is_empty());
}

#[test]
fn test_drain_audio_empty_buffer() {
    let mut mgr = SessionManager::new();
    mgr.create_session("s1".into(), "ferni".into());

    let drained = mgr.drain_audio("s1").unwrap();
    assert!(drained.is_empty());
}

#[test]
fn test_drain_audio_nonexistent_session() {
    let mut mgr = SessionManager::new();
    assert!(mgr.drain_audio("nonexistent").is_none());
}

#[test]
fn test_multiple_sessions() {
    let mut mgr = SessionManager::new();
    mgr.create_session("s1".into(), "ferni".into());
    mgr.create_session("s2".into(), "maya".into());
    mgr.create_session("s3".into(), "jordan".into());
    assert_eq!(mgr.session_count(), 3);

    mgr.append_audio("s1", &[1, 2]);
    mgr.append_audio("s2", &[3, 4, 5]);

    assert_eq!(mgr.get_session("s1").unwrap().audio_buffer.len(), 2);
    assert_eq!(mgr.get_session("s2").unwrap().audio_buffer.len(), 3);
    assert!(mgr.get_session("s3").unwrap().audio_buffer.is_empty());

    mgr.remove_session("s2");
    assert_eq!(mgr.session_count(), 2);
}

#[test]
fn test_session_default() {
    let mgr = SessionManager::default();
    assert_eq!(mgr.session_count(), 0);
}
