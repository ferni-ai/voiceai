import Foundation
import Contacts
import Combine

// MARK: - Contacts Service
/// Provides superhuman relationship awareness
/// Knows birthdays, anniversaries, and helps maintain connections

class ContactsService: ObservableObject {

    // MARK: - Published State

    /// Upcoming birthdays (within 7 days)
    @Published private(set) var upcomingBirthdays: [ContactInfo] = []

    /// Recently contacted people
    @Published private(set) var recentContacts: [ContactInfo] = []

    /// Whether contacts access is granted
    @Published private(set) var hasAccess: Bool = false

    /// Authorization status
    @Published private(set) var authorizationStatus: CNAuthorizationStatus = .notDetermined

    // MARK: - Private Properties

    private let store = CNContactStore()
    private var refreshTimer: Timer?

    // MARK: - Initialization

    init() {
        checkAuthorizationStatus()
        startRefreshTimer()
    }

    deinit {
        refreshTimer?.invalidate()
    }

    // MARK: - Authorization

    /// Check current authorization status
    func checkAuthorizationStatus() {
        authorizationStatus = CNContactStore.authorizationStatus(for: .contacts)
        hasAccess = authorizationStatus == .authorized
    }

    /// Request contacts access
    @MainActor
    func requestAccess() async -> Bool {
        do {
            let granted = try await store.requestAccess(for: .contacts)
            hasAccess = granted
            if granted {
                await refreshContacts()
            }
            return granted
        } catch {
            print("[Contacts] Access request error: \(error)")
            return false
        }
    }

    /// Open System Settings to Contacts section
    func openContactsSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Refresh

    private func startRefreshTimer() {
        // Refresh once per hour
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshContacts()
            }
        }

        // Initial refresh
        Task { @MainActor in
            await refreshContacts()
        }
    }

    @MainActor
    func refreshContacts() async {
        guard hasAccess else { return }

        await fetchUpcomingBirthdays()
    }

    // MARK: - Birthday Fetching

    private func fetchUpcomingBirthdays() async {
        let keysToFetch: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactNicknameKey as CNKeyDescriptor,
            CNContactBirthdayKey as CNKeyDescriptor,
            CNContactImageDataAvailableKey as CNKeyDescriptor,
            CNContactThumbnailImageDataKey as CNKeyDescriptor
        ]

        let request = CNContactFetchRequest(keysToFetch: keysToFetch)

        var birthdays: [ContactInfo] = []
        let calendar = Calendar.current
        let now = Date()
        let weekFromNow = calendar.date(byAdding: .day, value: 7, to: now)!

        do {
            try store.enumerateContacts(with: request) { contact, _ in
                guard let birthday = contact.birthday,
                      let birthdayDate = birthday.date else { return }

                // Check if birthday is within the next 7 days
                if let nextBirthday = self.nextOccurrence(of: birthdayDate, after: now),
                   nextBirthday <= weekFromNow {
                    let daysUntil = calendar.dateComponents([.day], from: now, to: nextBirthday).day ?? 0

                    birthdays.append(ContactInfo(
                        id: contact.identifier,
                        name: self.fullName(for: contact),
                        nickname: contact.nickname.isEmpty ? nil : contact.nickname,
                        birthday: birthdayDate,
                        daysUntilBirthday: daysUntil,
                        relationship: self.primaryRelationship(for: contact),
                        hasImage: contact.imageDataAvailable
                    ))
                }
            }

            // Sort by days until birthday
            upcomingBirthdays = birthdays.sorted { ($0.daysUntilBirthday ?? 999) < ($1.daysUntilBirthday ?? 999) }

        } catch {
            print("[Contacts] Failed to fetch birthdays: \(error)")
        }
    }

    /// Get the next occurrence of a birthday date
    private func nextOccurrence(of date: Date, after: Date) -> Date? {
        let calendar = Calendar.current
        var components = calendar.dateComponents([.month, .day], from: date)
        components.year = calendar.component(.year, from: after)

        guard var nextBirthday = calendar.date(from: components) else { return nil }

        // If the birthday has passed this year, get next year's
        if nextBirthday < after {
            components.year = (components.year ?? 0) + 1
            nextBirthday = calendar.date(from: components) ?? nextBirthday
        }

        return nextBirthday
    }

    private func fullName(for contact: CNContact) -> String {
        let name = [contact.givenName, contact.familyName]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return name.isEmpty ? "Unknown" : name
    }

    private func primaryRelationship(for contact: CNContact) -> String? {
        guard let firstRelation = contact.contactRelations.first else { return nil }
        return firstRelation.label?.replacingOccurrences(of: "_$!<", with: "")
            .replacingOccurrences(of: ">!$_", with: "")
    }

    // MARK: - Search

    /// Search contacts by name
    func searchContacts(query: String) -> [ContactInfo] {
        guard hasAccess, !query.isEmpty else { return [] }

        let keysToFetch: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactNicknameKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor
        ]

        let predicate = CNContact.predicateForContacts(matchingName: query)

        do {
            let contacts = try store.unifiedContacts(matching: predicate, keysToFetch: keysToFetch)
            return contacts.map { contact in
                ContactInfo(
                    id: contact.identifier,
                    name: fullName(for: contact),
                    nickname: contact.nickname.isEmpty ? nil : contact.nickname,
                    birthday: nil,
                    daysUntilBirthday: nil,
                    relationship: nil,
                    hasImage: false,
                    email: contact.emailAddresses.first?.value as String?,
                    phone: contact.phoneNumbers.first?.value.stringValue
                )
            }
        } catch {
            print("[Contacts] Search failed: \(error)")
            return []
        }
    }

    /// Get a specific contact by identifier
    func getContact(identifier: String) -> ContactInfo? {
        guard hasAccess else { return nil }

        let keysToFetch: [CNKeyDescriptor] = [
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactNicknameKey as CNKeyDescriptor,
            CNContactBirthdayKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor
        ]

        do {
            let contact = try store.unifiedContact(withIdentifier: identifier, keysToFetch: keysToFetch)
            return ContactInfo(
                id: contact.identifier,
                name: fullName(for: contact),
                nickname: contact.nickname.isEmpty ? nil : contact.nickname,
                birthday: contact.birthday?.date,
                daysUntilBirthday: nil,
                relationship: primaryRelationship(for: contact),
                hasImage: false,
                email: contact.emailAddresses.first?.value as String?,
                phone: contact.phoneNumbers.first?.value.stringValue
            )
        } catch {
            print("[Contacts] Failed to get contact: \(error)")
            return nil
        }
    }

    // MARK: - Context Generation

    /// Generate context string for the agent
    func generateContextString() -> String {
        var parts: [String] = []

        if !upcomingBirthdays.isEmpty {
            let birthdayList = upcomingBirthdays.prefix(3).map { contact in
                if contact.daysUntilBirthday == 0 {
                    return "\(contact.name)'s birthday is TODAY!"
                } else if contact.daysUntilBirthday == 1 {
                    return "\(contact.name)'s birthday is tomorrow"
                } else {
                    return "\(contact.name)'s birthday in \(contact.daysUntilBirthday ?? 0) days"
                }
            }
            parts.append("Upcoming birthdays: " + birthdayList.joined(separator: ", "))
        }

        return parts.joined(separator: "\n")
    }

    /// Get contacts context for data channel
    func getContactsContext() -> [String: Any] {
        var context: [String: Any] = [
            "hasAccess": hasAccess
        ]

        if !upcomingBirthdays.isEmpty {
            context["upcomingBirthdays"] = upcomingBirthdays.prefix(5).map { contact in
                [
                    "name": contact.name,
                    "daysUntil": contact.daysUntilBirthday ?? 0
                ]
            }
        }

        return context
    }
}

// MARK: - Contact Info Model

struct ContactInfo: Identifiable {
    let id: String
    let name: String
    let nickname: String?
    let birthday: Date?
    let daysUntilBirthday: Int?
    let relationship: String?
    let hasImage: Bool
    var email: String? = nil
    var phone: String? = nil

    /// Display name (nickname if available, otherwise full name)
    var displayName: String {
        nickname ?? name
    }

    /// Birthday formatted as "Month Day"
    var birthdayFormatted: String? {
        guard let birthday = birthday else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d"
        return formatter.string(from: birthday)
    }
}

// MARK: - NSWorkspace Import

import AppKit
