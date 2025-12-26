import Contacts
import Foundation
import os

/// Contacts service for relationship awareness
/// Enables "Better Than Human" by remembering everyone in the user's life
@MainActor
final class ContactsService: ObservableObject {
    static let shared = ContactsService()

    // MARK: - Published State

    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var contactCount: Int = 0
    @Published private(set) var recentlyMentioned: [CNContact] = []

    // MARK: - Private

    private let store = CNContactStore()
    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "Contacts")
    private var contactCache: [String: CNContact] = [:]  // Cache by identifier
    private var nameIndex: [String: [String]] = [:]      // Name -> identifiers

    // MARK: - Initialization

    private init() {
        Task {
            await checkAuthorization()
        }
    }

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        do {
            let granted = try await store.requestAccess(for: .contacts)
            isAuthorized = granted

            if granted {
                logger.info("Contacts access granted")
                await buildContactIndex()
            } else {
                logger.warning("Contacts access denied")
            }

            return granted
        } catch {
            logger.error("Contacts authorization error: \(error.localizedDescription)")
            return false
        }
    }

    func checkAuthorization() async {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        isAuthorized = status == .authorized

        if isAuthorized {
            await buildContactIndex()
        }
    }

    // MARK: - Contact Lookup (Better Than Human)

    /// Find a contact by name (first, last, or full)
    /// Returns the best match, enabling natural conversation about relationships
    func findContact(named name: String) -> CNContact? {
        guard isAuthorized else { return nil }

        let normalizedName = name.lowercased().trimmingCharacters(in: .whitespaces)

        // Check the name index
        if let identifiers = nameIndex[normalizedName],
           let firstId = identifiers.first,
           let contact = contactCache[firstId] {
            trackMention(contact)
            return contact
        }

        // Fuzzy search - find partial matches
        for (indexedName, identifiers) in nameIndex {
            if indexedName.contains(normalizedName) || normalizedName.contains(indexedName) {
                if let firstId = identifiers.first,
                   let contact = contactCache[firstId] {
                    trackMention(contact)
                    return contact
                }
            }
        }

        return nil
    }

    /// Find contacts matching a relationship type
    func findContacts(withRelationship relationship: String) async -> [CNContact] {
        guard isAuthorized else { return [] }

        let keysToFetch: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactRelationsKey as CNKeyDescriptor
        ]

        var matches: [CNContact] = []

        do {
            let request = CNContactFetchRequest(keysToFetch: keysToFetch)
            try store.enumerateContacts(with: request) { contact, _ in
                for relation in contact.contactRelations {
                    if relation.label?.lowercased().contains(relationship.lowercased()) == true {
                        matches.append(contact)
                        break
                    }
                }
            }
        } catch {
            logger.error("Failed to search relationships: \(error.localizedDescription)")
        }

        return matches
    }

    /// Get upcoming birthdays (Better Than Human - remembers everyone's birthday)
    func getUpcomingBirthdays(withinDays days: Int = 30) async -> [(contact: CNContact, date: DateComponents)] {
        guard isAuthorized else { return [] }

        let keysToFetch: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactBirthdayKey as CNKeyDescriptor
        ]

        var birthdays: [(CNContact, DateComponents)] = []
        let calendar = Calendar.current
        let today = calendar.dateComponents([.month, .day], from: Date())

        do {
            let request = CNContactFetchRequest(keysToFetch: keysToFetch)
            try store.enumerateContacts(with: request) { contact, _ in
                if let birthday = contact.birthday {
                    // Check if birthday is within the window
                    if let bdayDate = calendar.date(from: birthday),
                       let todayDate = calendar.date(from: today) {
                        let daysUntil = calendar.dateComponents([.day], from: todayDate, to: bdayDate).day ?? 0
                        if daysUntil >= 0 && daysUntil <= days {
                            birthdays.append((contact, birthday))
                        }
                    }
                }
            }
        } catch {
            logger.error("Failed to fetch birthdays: \(error.localizedDescription)")
        }

        return birthdays.sorted { first, second in
            guard let date1 = Calendar.current.date(from: first.1),
                  let date2 = Calendar.current.date(from: second.1) else {
                return false
            }
            return date1 < date2
        }
    }

    // MARK: - Contact Details

    /// Get phone number for a contact
    func getPhoneNumber(for contact: CNContact) -> String? {
        contact.phoneNumbers.first?.value.stringValue
    }

    /// Get email for a contact
    func getEmail(for contact: CNContact) -> String? {
        contact.emailAddresses.first?.value as String?
    }

    /// Get full name for a contact
    func getFullName(for contact: CNContact) -> String {
        let formatter = CNContactFormatter()
        return formatter.string(from: contact) ?? "\(contact.givenName) \(contact.familyName)"
    }

    /// Get all contact info for voice agent context
    func getContactInfo(_ contact: CNContact) -> [String: Any] {
        return [
            "firstName": contact.givenName,
            "lastName": contact.familyName,
            "fullName": getFullName(for: contact),
            "phone": getPhoneNumber(for: contact) ?? "",
            "email": getEmail(for: contact) ?? "",
            "hasBirthday": contact.birthday != nil
        ]
    }

    // MARK: - Recently Mentioned

    /// Track when a contact is mentioned in conversation
    private func trackMention(_ contact: CNContact) {
        // Add to front of recently mentioned list
        if let existingIndex = recentlyMentioned.firstIndex(where: { $0.identifier == contact.identifier }) {
            recentlyMentioned.remove(at: existingIndex)
        }
        recentlyMentioned.insert(contact, at: 0)

        // Keep only last 10
        if recentlyMentioned.count > 10 {
            recentlyMentioned = Array(recentlyMentioned.prefix(10))
        }
    }

    /// Get recently mentioned contacts for context
    func getRecentlyMentionedNames() -> [String] {
        recentlyMentioned.map { getFullName(for: $0) }
    }

    // MARK: - Private Helpers

    private func buildContactIndex() async {
        contactCache.removeAll()
        nameIndex.removeAll()

        let keysToFetch: [CNKeyDescriptor] = [
            CNContactIdentifierKey as CNKeyDescriptor,
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactNicknameKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor,
            CNContactBirthdayKey as CNKeyDescriptor,
            CNContactRelationsKey as CNKeyDescriptor
        ]

        do {
            let request = CNContactFetchRequest(keysToFetch: keysToFetch)
            var count = 0

            try store.enumerateContacts(with: request) { [weak self] contact, _ in
                guard let self = self else { return }

                // Cache the contact
                self.contactCache[contact.identifier] = contact
                count += 1

                // Index by various name forms
                let names = [
                    contact.givenName.lowercased(),
                    contact.familyName.lowercased(),
                    "\(contact.givenName) \(contact.familyName)".lowercased(),
                    contact.nickname.lowercased()
                ].filter { !$0.isEmpty && $0 != " " }

                for name in names {
                    if self.nameIndex[name] == nil {
                        self.nameIndex[name] = []
                    }
                    self.nameIndex[name]?.append(contact.identifier)
                }
            }

            contactCount = count
            logger.info("Indexed \(count) contacts")

        } catch {
            logger.error("Failed to build contact index: \(error.localizedDescription)")
        }
    }
}

// MARK: - Voice Agent Integration

extension ContactsService {
    /// Parse a name from conversation and find the contact
    func resolveContactFromConversation(_ transcript: String) -> CNContact? {
        // Simple extraction - find capitalized words that might be names
        let words = transcript.components(separatedBy: .whitespaces)
        let capitalizedWords = words.filter { word in
            guard let first = word.first else { return false }
            return first.isUppercase && word.count > 1
        }

        // Try pairs first (full names)
        for i in 0..<(capitalizedWords.count - 1) {
            let fullName = "\(capitalizedWords[i]) \(capitalizedWords[i + 1])"
            if let contact = findContact(named: fullName) {
                return contact
            }
        }

        // Then try individual names
        for word in capitalizedWords {
            if let contact = findContact(named: word) {
                return contact
            }
        }

        return nil
    }

    /// Get contacts context for voice agent
    func getContactsContext() -> [String: Any] {
        return [
            "isAuthorized": isAuthorized,
            "contactCount": contactCount,
            "recentlyMentioned": getRecentlyMentionedNames()
        ]
    }
}
