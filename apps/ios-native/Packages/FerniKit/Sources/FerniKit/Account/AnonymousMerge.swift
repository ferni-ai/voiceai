import Foundation
import os

/// Asks the server to move what a person said as an anonymous account into
/// the account they just signed in to (credentialAlreadyInUse; when the
/// credential links instead, the uid is kept and there's nothing to merge).
///
/// `POST /api/identity/merge-anonymous {anonIdToken}` as the account they're
/// on now. The anonymous token is the proof the old account was theirs; the
/// server takes it under an hour old. Idempotent, so a lost answer or a 500
/// `{merged: false, error}` is retried once; 409 `{merged: false, reason}`,
/// 403 (the token isn't anonymous) and 404 (route not deployed) are a quiet
/// no. Behind IDENTITY_MERGE_ANON (PR #2226).
public enum AnonymousMerge {
    /// One retry, never a loop.
    public static let retryDelays: [Duration] = [.seconds(2)]

    public static func merger(
        api: FerniAPI, retryDelays: [Duration] = AnonymousMerge.retryDelays
    ) -> @Sendable (LeftBehindAccount) async -> Bool {
        { leftBehind in
            let log = Logger(subsystem: "com.sethdford.ferni", category: "account")
            guard let token = leftBehind.idToken else {
                log.error("No token for the anonymous account left behind; it can't be merged")
                return false
            }
            struct Body: Encodable, Sendable { let anonIdToken: String }
            struct Answer: Decodable { let merged: Bool }
            for delay in [Duration.zero] + retryDelays {
                if delay > .zero { try? await Task.sleep(for: delay) }
                do {
                    let data = try await api.data(
                        "/api/identity/merge-anonymous", method: "POST", json: Body(anonIdToken: token)
                    )
                    return (try? JSONDecoder().decode(Answer.self, from: data))?.merged ?? false
                } catch FerniAPIError.unreachable {
                    continue
                } catch FerniAPIError.status(let status) where status >= 500 {
                    continue
                } catch {
                    log.error("Anonymous account not merged: \(String(describing: error), privacy: .public)")
                    return false
                }
            }
            log.error("Anonymous account not merged: the server never answered")
            return false
        }
    }
}
