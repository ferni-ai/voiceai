use anyhow::Result;
use std::path::PathBuf;

use crate::io::{IoArgs, SynthesisMode, VoiceArgs};

pub enum DetectedMode {
    CustomVoice {
        speaker: String,
        instruct: Option<String>,
    },
    VoiceDesign {
        description: String,
    },
    VoiceClone {
        /// Reference audio path (None if using --load-prompt)
        ref_audio: Option<PathBuf>,
        ref_text: Option<String>,
        x_vector_only: bool,
    },
}

pub fn determine_mode(
    io_args: &IoArgs,
    voice_args: &VoiceArgs,
    mode: Option<&SynthesisMode>,
) -> Result<DetectedMode> {
    // Check subcommand first
    if let Some(mode) = mode {
        return match mode {
            SynthesisMode::CustomVoice { speaker, instruct } => Ok(DetectedMode::CustomVoice {
                speaker: speaker.clone(),
                instruct: instruct.clone(),
            }),
            SynthesisMode::VoiceDesign { description } => Ok(DetectedMode::VoiceDesign {
                description: description.clone(),
            }),
            SynthesisMode::VoiceClone {
                audio,
                transcript,
                x_vector_only,
            } => Ok(DetectedMode::VoiceClone {
                ref_audio: Some(audio.clone()),
                ref_text: transcript.clone(),
                x_vector_only: *x_vector_only,
            }),
        };
    }

    // Check flat args
    // Voice cloning takes priority when --ref-audio is provided (explicit intent)
    if voice_args.ref_audio.is_some() || io_args.load_prompt.is_some() {
        return Ok(DetectedMode::VoiceClone {
            ref_audio: voice_args.ref_audio.clone(),
            ref_text: voice_args.ref_text.clone(),
            x_vector_only: voice_args.x_vector_only,
        });
    }

    if let Some(ref speaker) = voice_args.speaker {
        return Ok(DetectedMode::CustomVoice {
            speaker: speaker.clone(),
            instruct: voice_args.instruct.clone(),
        });
    }

    if let Some(ref desc) = voice_args.voice_design {
        return Ok(DetectedMode::VoiceDesign {
            description: desc.clone(),
        });
    }

    // Default to CustomVoice with a default speaker
    tracing::info!("No synthesis mode specified, defaulting to CustomVoice with speaker 'vivian'");
    Ok(DetectedMode::CustomVoice {
        speaker: "vivian".to_string(),
        instruct: voice_args.instruct.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn default_io_args() -> IoArgs {
        IoArgs::default()
    }

    fn default_voice_args() -> VoiceArgs {
        VoiceArgs::default()
    }

    #[test]
    fn test_determine_mode_explicit_custom_voice() {
        let io_args = default_io_args();
        let voice_args = default_voice_args();
        let mode = SynthesisMode::CustomVoice {
            speaker: "ethan".to_string(),
            instruct: Some("Speak slowly".to_string()),
        };

        let result = determine_mode(&io_args, &voice_args, Some(&mode)).unwrap();

        match result {
            DetectedMode::CustomVoice { speaker, instruct } => {
                assert_eq!(speaker, "ethan");
                assert_eq!(instruct, Some("Speak slowly".to_string()));
            }
            _ => panic!("Expected CustomVoice mode"),
        }
    }

    #[test]
    fn test_determine_mode_explicit_voice_design() {
        let io_args = default_io_args();
        let voice_args = default_voice_args();
        let mode = SynthesisMode::VoiceDesign {
            description: "A warm, friendly female voice".to_string(),
        };

        let result = determine_mode(&io_args, &voice_args, Some(&mode)).unwrap();

        match result {
            DetectedMode::VoiceDesign { description } => {
                assert_eq!(description, "A warm, friendly female voice");
            }
            _ => panic!("Expected VoiceDesign mode"),
        }
    }

    #[test]
    fn test_determine_mode_explicit_voice_clone() {
        let io_args = default_io_args();
        let voice_args = default_voice_args();
        let mode = SynthesisMode::VoiceClone {
            audio: PathBuf::from("/path/to/audio.wav"),
            transcript: Some("Hello world".to_string()),
            x_vector_only: true,
        };

        let result = determine_mode(&io_args, &voice_args, Some(&mode)).unwrap();

        match result {
            DetectedMode::VoiceClone {
                ref_audio,
                ref_text,
                x_vector_only,
            } => {
                assert_eq!(ref_audio, Some(PathBuf::from("/path/to/audio.wav")));
                assert_eq!(ref_text, Some("Hello world".to_string()));
                assert!(x_vector_only);
            }
            _ => panic!("Expected VoiceClone mode"),
        }
    }

    #[test]
    fn test_determine_mode_ref_audio_flat_arg() {
        let io_args = default_io_args();
        let mut voice_args = default_voice_args();
        voice_args.ref_audio = Some(PathBuf::from("/path/to/ref.wav"));
        voice_args.ref_text = Some("Reference transcript".to_string());

        let result = determine_mode(&io_args, &voice_args, None).unwrap();

        match result {
            DetectedMode::VoiceClone {
                ref_audio,
                ref_text,
                x_vector_only,
            } => {
                assert_eq!(ref_audio, Some(PathBuf::from("/path/to/ref.wav")));
                assert_eq!(ref_text, Some("Reference transcript".to_string()));
                assert!(!x_vector_only);
            }
            _ => panic!("Expected VoiceClone mode from ref_audio"),
        }
    }

    #[test]
    fn test_determine_mode_load_prompt() {
        let mut io_args = default_io_args();
        io_args.load_prompt = Some(PathBuf::from("/path/to/prompt.bin"));
        let voice_args = default_voice_args();

        let result = determine_mode(&io_args, &voice_args, None).unwrap();

        match result {
            DetectedMode::VoiceClone {
                ref_audio,
                ref_text,
                ..
            } => {
                // ref_audio should be None when using load_prompt
                assert!(ref_audio.is_none());
                assert!(ref_text.is_none());
            }
            _ => panic!("Expected VoiceClone mode from load_prompt"),
        }
    }

    #[test]
    fn test_determine_mode_speaker_flat_arg() {
        let io_args = default_io_args();
        let mut voice_args = default_voice_args();
        voice_args.speaker = Some("david".to_string());
        voice_args.instruct = Some("Be enthusiastic".to_string());

        let result = determine_mode(&io_args, &voice_args, None).unwrap();

        match result {
            DetectedMode::CustomVoice { speaker, instruct } => {
                assert_eq!(speaker, "david");
                assert_eq!(instruct, Some("Be enthusiastic".to_string()));
            }
            _ => panic!("Expected CustomVoice mode from speaker"),
        }
    }

    #[test]
    fn test_determine_mode_voice_design_flat_arg() {
        let io_args = default_io_args();
        let mut voice_args = default_voice_args();
        voice_args.voice_design = Some("An elderly British gentleman".to_string());

        let result = determine_mode(&io_args, &voice_args, None).unwrap();

        match result {
            DetectedMode::VoiceDesign { description } => {
                assert_eq!(description, "An elderly British gentleman");
            }
            _ => panic!("Expected VoiceDesign mode from voice_design"),
        }
    }

    #[test]
    fn test_determine_mode_default() {
        let io_args = default_io_args();
        let voice_args = default_voice_args();

        let result = determine_mode(&io_args, &voice_args, None).unwrap();

        match result {
            DetectedMode::CustomVoice { speaker, instruct } => {
                assert_eq!(speaker, "vivian");
                assert!(instruct.is_none());
            }
            _ => panic!("Expected default CustomVoice mode"),
        }
    }

    #[test]
    fn test_determine_mode_priority_ref_audio_over_speaker() {
        // ref_audio should take priority over speaker
        let io_args = default_io_args();
        let mut voice_args = default_voice_args();
        voice_args.ref_audio = Some(PathBuf::from("/path/to/ref.wav"));
        voice_args.speaker = Some("david".to_string());

        let result = determine_mode(&io_args, &voice_args, None).unwrap();

        match result {
            DetectedMode::VoiceClone { ref_audio, .. } => {
                assert!(ref_audio.is_some());
            }
            _ => panic!("Expected VoiceClone to take priority over CustomVoice"),
        }
    }
}
