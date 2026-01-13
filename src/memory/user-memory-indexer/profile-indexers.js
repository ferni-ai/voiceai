/**
 * Profile Indexers
 *
 * Index profile-related data: key moments, people, threads, follow-ups,
 * life events, goals, persona memories, shared content, preferences, entertainment.
 *
 * @module memory/user-memory-indexer/profile-indexers
 */
import { getLogger } from '../../utils/safe-logger.js';
import { generateDocId } from './types.js';
const log = getLogger().child({ module: 'UserMemoryIndexer' });
// ============================================================================
// KEY MOMENTS
// ============================================================================
/**
 * Index key moments (breakthroughs, vulnerabilities, celebrations)
 */
export async function indexKeyMoments(userId, moments, store) {
    let indexed = 0;
    for (const moment of moments) {
        const text = `${moment.type}: ${moment.summary}. Topics: ${moment.topics.join(', ')}`;
        const doc = {
            id: generateDocId('key_moment', userId, moment.id),
            text,
            metadata: {
                source: 'user_memory',
                category: 'key_moment',
                momentType: moment.type,
                emotionalWeight: moment.emotionalWeight,
                userId,
                timestamp: moment.timestamp,
                topics: moment.topics,
                followUpNeeded: moment.followUpNeeded,
            },
        };
        try {
            await store.addDocument(doc);
            indexed++;
        }
        catch (err) {
            log.debug({ error: err, momentId: moment.id }, 'Failed to index key moment');
        }
    }
    return indexed;
}
// ============================================================================
// PEOPLE
// ============================================================================
/**
 * Index family members and people mentioned
 */
export async function indexPeople(userId, userName, familyMembers, store) {
    let indexed = 0;
    for (const member of familyMembers) {
        const personName = member.name || member.relationship;
        const text = `${userName || 'User'}'s ${member.relationship}${member.name ? ` named ${member.name}` : ''}. ${member.mentionedTopics?.length ? `Discussed: ${member.mentionedTopics.join(', ')}` : ''}`;
        const doc = {
            id: generateDocId('person', userId, `${member.relationship}_${personName}`),
            text,
            metadata: {
                source: 'user_memory',
                category: 'person',
                personType: 'family',
                relationship: member.relationship,
                personName: member.name || null,
                userId,
                lastMentioned: member.lastMentioned,
                mentionedTopics: member.mentionedTopics,
            },
        };
        try {
            await store.addDocument(doc);
            indexed++;
        }
        catch (err) {
            log.debug({ error: err, relationship: member.relationship }, 'Failed to index person');
        }
    }
    return indexed;
}
// ============================================================================
// THREADS & FOLLOW-UPS
// ============================================================================
/**
 * Index open threads (cross-session topics to resume)
 */
export async function indexOpenThreads(userId, threads, store) {
    if (!threads)
        return 0;
    let indexed = 0;
    for (const thread of threads) {
        const text = `Open topic: ${thread.topic}. Reason: ${thread.reason}. Resume with: "${thread.suggestedResumption}"`;
        const doc = {
            id: generateDocId('thread', userId, thread.id),
            text,
            metadata: {
                source: 'user_memory',
                category: 'thread',
                priority: thread.priority,
                status: thread.status,
                userId,
                timestamp: thread.createdAt,
                topic: thread.topic,
            },
        };
        try {
            await store.addDocument(doc);
            indexed++;
        }
        catch (err) {
            log.debug({ error: err, threadId: thread.id }, 'Failed to index thread');
        }
    }
    return indexed;
}
/**
 * Index pending follow-ups (commitments to user)
 */
export async function indexFollowUps(userId, followUps, store) {
    if (!followUps)
        return 0;
    let indexed = 0;
    for (const followUp of followUps) {
        const text = `Follow up about: ${followUp.topic}. Reason: ${followUp.reason}`;
        const doc = {
            id: generateDocId('followup', userId, `${followUp.topic}_${followUp.targetDate}`),
            text,
            metadata: {
                source: 'user_memory',
                category: 'followup',
                userId,
                targetDate: followUp.targetDate,
                topic: followUp.topic,
                reason: followUp.reason,
            },
        };
        try {
            await store.addDocument(doc);
            indexed++;
        }
        catch (err) {
            log.debug({ error: err, topic: followUp.topic }, 'Failed to index follow-up');
        }
    }
    return indexed;
}
// ============================================================================
// LIFE EVENTS & GOALS
// ============================================================================
/**
 * Index life events (weddings, babies, career changes, etc.)
 */
export async function indexLifeEvents(userId, events, store) {
    let indexed = 0;
    for (const event of events) {
        const text = `Life event: ${event.title}${event.description ? `. ${event.description}` : ''}. Type: ${event.type}. Status: ${event.status}`;
        const doc = {
            id: generateDocId('life_event', userId, event.id),
            text,
            metadata: {
                source: 'user_memory',
                category: 'life_event',
                eventType: event.type,
                emotionalSignificance: event.emotionalSignificance,
                status: event.status,
                userId,
                eventDate: event.date,
                timestamp: event.createdAt,
                teamInvolved: event.teamInvolved,
            },
        };
        try {
            await store.addDocument(doc);
            indexed++;
        }
        catch (err) {
            log.debug({ error: err, eventId: event.id }, 'Failed to index life event');
        }
    }
    return indexed;
}
/**
 * Index financial goals with notes
 */
export async function indexGoals(userId, goals, store) {
    let indexed = 0;
    for (const goal of goals) {
        const text = `Goal: ${goal.name}. Type: ${goal.type}. ${goal.targetAmount ? `Target: $${goal.targetAmount}. ` : ''}Status: ${goal.status}. Priority: ${goal.priority}. ${goal.jackNotes ? `Notes: ${goal.jackNotes}` : ''}`;
        const doc = {
            id: generateDocId('goal', userId, goal.id),
            text,
            metadata: {
                source: 'user_memory',
                category: 'goal',
                goalType: goal.type,
                status: goal.status,
                priority: goal.priority,
                userId,
                targetDate: goal.targetDate,
                targetAmount: goal.targetAmount,
                progressPercent: goal.progressPercent,
                timestamp: goal.createdAt,
            },
        };
        try {
            await store.addDocument(doc);
            indexed++;
        }
        catch (err) {
            log.debug({ error: err, goalId: goal.id }, 'Failed to index goal');
        }
    }
    return indexed;
}
// ============================================================================
// PERSONA MEMORIES
// ============================================================================
/**
 * Index per-persona specific memories
 */
export async function indexPersonaMemories(userId, personaMemories, store) {
    if (!personaMemories)
        return 0;
    let indexed = 0;
    // Index each persona's memories
    const personas = Object.entries(personaMemories);
    for (const [personaId, memories] of personas) {
        if (!memories)
            continue;
        for (const memory of memories) {
            const text = `${personaId} learned: ${memory.type} - ${memory.name}${memory.details ? `. ${memory.details}` : ''}. Tags: ${memory.tags.join(', ')}`;
            const doc = {
                id: generateDocId('persona_learning', userId, `${personaId}_${memory.id}`),
                text,
                metadata: {
                    source: 'user_memory',
                    category: 'persona_learning',
                    personaId,
                    memoryType: memory.type,
                    userId,
                    timestamp: memory.createdAt,
                    tags: memory.tags,
                },
            };
            try {
                await store.addDocument(doc);
                indexed++;
            }
            catch (err) {
                log.debug({ error: err, memoryId: memory.id }, 'Failed to index persona memory');
            }
        }
    }
    return indexed;
}
// ============================================================================
// SHARED CONTENT
// ============================================================================
/**
 * Index shared stories and content
 */
export async function indexSharedContent(userId, sharedStories, humanizingState, store) {
    let indexed = 0;
    // Index shared stories
    if (sharedStories) {
        for (const story of sharedStories) {
            const text = `Story shared: ${story.theme}. Context: ${story.context}${story.userReaction ? `. User reaction: ${story.userReaction}` : ''}`;
            const doc = {
                id: generateDocId('shared_content', userId, `story_${story.storyId}`),
                text,
                metadata: {
                    source: 'user_memory',
                    category: 'shared_content',
                    contentType: 'story',
                    storyId: story.storyId,
                    userReaction: story.userReaction,
                    userId,
                    timestamp: story.sharedAt,
                },
            };
            try {
                await store.addDocument(doc);
                indexed++;
            }
            catch (err) {
                log.debug({ error: err, storyId: story.storyId }, 'Failed to index shared story');
            }
        }
    }
    // Index inner world revelations from humanizing state
    if (humanizingState?.innerWorldRevealed) {
        for (const revelation of humanizingState.innerWorldRevealed) {
            const text = `Shared ${revelation.type}: ${revelation.content}`;
            const doc = {
                id: generateDocId('shared_content', userId, `inner_${revelation.sharedAt.getTime()}`),
                text,
                metadata: {
                    source: 'user_memory',
                    category: 'shared_content',
                    contentType: revelation.type,
                    userId,
                    timestamp: revelation.sharedAt,
                },
            };
            try {
                await store.addDocument(doc);
                indexed++;
            }
            catch (err) {
                log.debug({ error: err }, 'Failed to index inner world revelation');
            }
        }
    }
    return indexed;
}
// ============================================================================
// PREFERENCES
// ============================================================================
/**
 * Index user preferences and communication style
 */
export async function indexPreferences(userId, profile, store) {
    let indexed = 0;
    // Communication preferences
    const commText = `Communication style: ${profile.communicationStyle}. Speaking pace: ${profile.speakingPace}. Humor appreciation: ${profile.humorAppreciation}. ${profile.preferredTopics.length
        ? `Likes discussing: ${profile.preferredTopics.join(', ')}. `
        : ''}${profile.avoidTopics.length ? `Avoids: ${profile.avoidTopics.join(', ')}` : ''}`;
    const commDoc = {
        id: generateDocId('preference', userId, 'communication_style'),
        text: commText,
        metadata: {
            source: 'user_memory',
            category: 'preference',
            preferenceType: 'communication',
            userId,
            updatedAt: profile.updatedAt,
        },
    };
    try {
        await store.addDocument(commDoc);
        indexed++;
    }
    catch (err) {
        log.debug({ error: err }, 'Failed to index communication preferences');
    }
    // Verbosity and other preferences
    if (profile.preferences) {
        const prefText = `Prefers ${profile.preferences.verbosity} responses. ${profile.preferences.topicsToAvoid.length
            ? `Topics to avoid: ${profile.preferences.topicsToAvoid.join(', ')}. `
            : ''}${profile.preferences.wantsProactiveAdvice ? 'Open to proactive advice.' : 'Prefers to lead conversations.'}`;
        const prefDoc = {
            id: generateDocId('preference', userId, 'response_style'),
            text: prefText,
            metadata: {
                source: 'user_memory',
                category: 'preference',
                preferenceType: 'style',
                userId,
                updatedAt: profile.updatedAt,
            },
        };
        try {
            await store.addDocument(prefDoc);
            indexed++;
        }
        catch (err) {
            log.debug({ error: err }, 'Failed to index response preferences');
        }
    }
    return indexed;
}
// ============================================================================
// ENTERTAINMENT
// ============================================================================
/**
 * Index music and entertainment memories
 */
export async function indexEntertainment(userId, musicMemory, gameMemory, store) {
    let indexed = 0;
    // Music favorites
    if (musicMemory) {
        if (musicMemory.favoriteArtists.length > 0) {
            const text = `Favorite artists: ${musicMemory.favoriteArtists.join(', ')}. ${musicMemory.favoriteGenres.length
                ? `Genres: ${musicMemory.favoriteGenres.join(', ')}. `
                : ''}${musicMemory.dislikedArtists.length ? `Dislikes: ${musicMemory.dislikedArtists.join(', ')}` : ''}`;
            const doc = {
                id: generateDocId('entertainment', userId, 'music_preferences'),
                text,
                metadata: {
                    source: 'user_memory',
                    category: 'entertainment',
                    entertainmentType: 'music',
                    subType: 'preferences',
                    userId,
                    updatedAt: musicMemory.updatedAt,
                },
            };
            try {
                await store.addDocument(doc);
                indexed++;
            }
            catch (err) {
                log.debug({ error: err }, 'Failed to index music preferences');
            }
        }
        // Shared music moments
        if (musicMemory.sharedMoments) {
            for (const moment of musicMemory.sharedMoments) {
                const text = `Shared music moment: ${moment.description}. Artist: ${moment.artist}`;
                const doc = {
                    id: generateDocId('entertainment', userId, `music_moment_${moment.timestamp}`),
                    text,
                    metadata: {
                        source: 'user_memory',
                        category: 'entertainment',
                        entertainmentType: 'music',
                        subType: 'shared_moment',
                        artist: moment.artist,
                        userId,
                        timestamp: new Date(moment.timestamp),
                    },
                };
                try {
                    await store.addDocument(doc);
                    indexed++;
                }
                catch (err) {
                    log.debug({ error: err }, 'Failed to index music moment');
                }
            }
        }
    }
    // Game milestones
    if (gameMemory?.milestones) {
        for (const milestone of gameMemory.milestones) {
            const text = `Game milestone: ${milestone.type} in ${milestone.gameType}${milestone.context ? `. ${milestone.context}` : ''}`;
            const doc = {
                id: generateDocId('entertainment', userId, `game_milestone_${milestone.achievedAt.getTime()}`),
                text,
                metadata: {
                    source: 'user_memory',
                    category: 'entertainment',
                    entertainmentType: 'game',
                    subType: 'milestone',
                    milestoneType: milestone.type,
                    gameType: milestone.gameType,
                    userId,
                    timestamp: milestone.achievedAt,
                },
            };
            try {
                await store.addDocument(doc);
                indexed++;
            }
            catch (err) {
                log.debug({ error: err }, 'Failed to index game milestone');
            }
        }
    }
    return indexed;
}
//# sourceMappingURL=profile-indexers.js.map