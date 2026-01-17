//
//  ShareViewController.swift
//  FerniShareExtension
//
//  Share content with Ferni from any app.
//  Share articles, quotes, photos - Ferni remembers and can discuss them later.
//
//  🎯 SUPERHUMAN CAPABILITIES:
//  - Save articles for later discussion
//  - Share quotes for reflection
//  - Share photos for memory preservation
//  - Quick journal entries
//  - Context capture for future conversations
//

import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices

// MARK: - Share View Controller

final class ShareViewController: UIViewController {
    
    // MARK: - UI Elements
    
    private let containerView: UIView = {
        let view = UIView()
        view.backgroundColor = UIColor(red: 0.10, green: 0.09, blue: 0.07, alpha: 1.0) // Ferni dark bg
        view.layer.cornerRadius = 20
        view.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()
    
    private let headerView: UIView = {
        let view = UIView()
        view.backgroundColor = .clear
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()
    
    private let ferniIconView: UIImageView = {
        let imageView = UIImageView()
        imageView.image = UIImage(systemName: "bubble.left.fill")
        imageView.tintColor = UIColor(red: 0.29, green: 0.40, blue: 0.25, alpha: 1.0) // Ferni green
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        return imageView
    }()
    
    private let titleLabel: UILabel = {
        let label = UILabel()
        label.text = "Share with Ferni"
        label.font = .systemFont(ofSize: 20, weight: .semibold)
        label.textColor = .white
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()
    
    private let closeButton: UIButton = {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        button.tintColor = .white.withAlphaComponent(0.6)
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }()
    
    private let contentPreviewLabel: UILabel = {
        let label = UILabel()
        label.text = "Loading..."
        label.font = .systemFont(ofSize: 15)
        label.textColor = .white.withAlphaComponent(0.8)
        label.numberOfLines = 4
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()
    
    private let noteTextView: UITextView = {
        let textView = UITextView()
        textView.backgroundColor = UIColor.white.withAlphaComponent(0.1)
        textView.textColor = .white
        textView.font = .systemFont(ofSize: 16)
        textView.layer.cornerRadius = 12
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        textView.translatesAutoresizingMaskIntoConstraints = false
        return textView
    }()
    
    private let placeholderLabel: UILabel = {
        let label = UILabel()
        label.text = "Add a note for Ferni... (optional)"
        label.font = .systemFont(ofSize: 16)
        label.textColor = .white.withAlphaComponent(0.4)
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()
    
    private let categoryStackView: UIStackView = {
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.spacing = 8
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }()
    
    private let saveButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("Save for Later", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = UIColor(red: 0.29, green: 0.40, blue: 0.25, alpha: 1.0) // Ferni green
        button.layer.cornerRadius = 14
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }()
    
    private let talkNowButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("Talk About This Now", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 15)
        button.setTitleColor(UIColor(red: 0.29, green: 0.40, blue: 0.25, alpha: 1.0), for: .normal)
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }()
    
    // MARK: - Properties
    
    private var sharedContent: SharedContent?
    private var selectedCategory: ContentCategory = .general
    
    // MARK: - Lifecycle
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        extractSharedContent()
    }
    
    // MARK: - Setup
    
    private func setupUI() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.5)
        
        // Container
        view.addSubview(containerView)
        NSLayoutConstraint.activate([
            containerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            containerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            containerView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            containerView.heightAnchor.constraint(equalTo: view.heightAnchor, multiplier: 0.6)
        ])
        
        // Header
        containerView.addSubview(headerView)
        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 16),
            headerView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),
            headerView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -20),
            headerView.heightAnchor.constraint(equalToConstant: 44)
        ])
        
        // Ferni icon
        headerView.addSubview(ferniIconView)
        NSLayoutConstraint.activate([
            ferniIconView.leadingAnchor.constraint(equalTo: headerView.leadingAnchor),
            ferniIconView.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            ferniIconView.widthAnchor.constraint(equalToConstant: 28),
            ferniIconView.heightAnchor.constraint(equalToConstant: 28)
        ])
        
        // Title
        headerView.addSubview(titleLabel)
        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: ferniIconView.trailingAnchor, constant: 10),
            titleLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor)
        ])
        
        // Close button
        headerView.addSubview(closeButton)
        NSLayoutConstraint.activate([
            closeButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor),
            closeButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 30),
            closeButton.heightAnchor.constraint(equalToConstant: 30)
        ])
        closeButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        
        // Content preview
        containerView.addSubview(contentPreviewLabel)
        NSLayoutConstraint.activate([
            contentPreviewLabel.topAnchor.constraint(equalTo: headerView.bottomAnchor, constant: 20),
            contentPreviewLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),
            contentPreviewLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -20)
        ])
        
        // Category buttons
        containerView.addSubview(categoryStackView)
        NSLayoutConstraint.activate([
            categoryStackView.topAnchor.constraint(equalTo: contentPreviewLabel.bottomAnchor, constant: 16),
            categoryStackView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),
            categoryStackView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -20),
            categoryStackView.heightAnchor.constraint(equalToConstant: 36)
        ])
        setupCategoryButtons()
        
        // Note text view
        containerView.addSubview(noteTextView)
        NSLayoutConstraint.activate([
            noteTextView.topAnchor.constraint(equalTo: categoryStackView.bottomAnchor, constant: 16),
            noteTextView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),
            noteTextView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -20),
            noteTextView.heightAnchor.constraint(equalToConstant: 100)
        ])
        noteTextView.delegate = self
        
        // Placeholder
        noteTextView.addSubview(placeholderLabel)
        NSLayoutConstraint.activate([
            placeholderLabel.topAnchor.constraint(equalTo: noteTextView.topAnchor, constant: 12),
            placeholderLabel.leadingAnchor.constraint(equalTo: noteTextView.leadingAnchor, constant: 16)
        ])
        
        // Save button
        containerView.addSubview(saveButton)
        NSLayoutConstraint.activate([
            saveButton.topAnchor.constraint(equalTo: noteTextView.bottomAnchor, constant: 20),
            saveButton.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 20),
            saveButton.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -20),
            saveButton.heightAnchor.constraint(equalToConstant: 52)
        ])
        saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
        
        // Talk now button
        containerView.addSubview(talkNowButton)
        NSLayoutConstraint.activate([
            talkNowButton.topAnchor.constraint(equalTo: saveButton.bottomAnchor, constant: 12),
            talkNowButton.centerXAnchor.constraint(equalTo: containerView.centerXAnchor)
        ])
        talkNowButton.addTarget(self, action: #selector(talkNowTapped), for: .touchUpInside)
        
        // Tap to dismiss keyboard
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tapGesture.cancelsTouchesInView = false
        view.addGestureRecognizer(tapGesture)
    }
    
    private func setupCategoryButtons() {
        let categories: [ContentCategory] = [.inspiration, .discuss, .remember, .journal]
        
        for category in categories {
            let button = createCategoryButton(category)
            categoryStackView.addArrangedSubview(button)
        }
    }
    
    private func createCategoryButton(_ category: ContentCategory) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(category.displayName, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 13, weight: .medium)
        button.setTitleColor(.white.withAlphaComponent(0.7), for: .normal)
        button.setTitleColor(.white, for: .selected)
        button.backgroundColor = UIColor.white.withAlphaComponent(0.1)
        button.layer.cornerRadius = 18
        button.tag = category.rawValue
        button.addTarget(self, action: #selector(categoryTapped(_:)), for: .touchUpInside)
        return button
    }
    
    // MARK: - Content Extraction
    
    private func extractSharedContent() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            contentPreviewLabel.text = "No content to share"
            return
        }
        
        for item in extensionItems {
            guard let attachments = item.attachments else { continue }
            
            for provider in attachments {
                // Check for URL
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] (item, error) in
                        if let url = item as? URL {
                            DispatchQueue.main.async {
                                self?.handleURL(url)
                            }
                        }
                    }
                    return
                }
                
                // Check for text
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] (item, error) in
                        if let text = item as? String {
                            DispatchQueue.main.async {
                                self?.handleText(text)
                            }
                        }
                    }
                    return
                }
                
                // Check for image
                if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] (item, error) in
                        if let imageURL = item as? URL {
                            DispatchQueue.main.async {
                                self?.handleImage(imageURL)
                            }
                        } else if let image = item as? UIImage {
                            DispatchQueue.main.async {
                                self?.handleImageData(image)
                            }
                        }
                    }
                    return
                }
            }
        }
        
        contentPreviewLabel.text = "Unsupported content type"
    }
    
    private func handleURL(_ url: URL) {
        sharedContent = SharedContent(type: .url, url: url, text: url.absoluteString)
        contentPreviewLabel.text = "🔗 \(url.host ?? url.absoluteString)"
    }
    
    private func handleText(_ text: String) {
        sharedContent = SharedContent(type: .text, text: text)
        contentPreviewLabel.text = "📝 \"\(text.prefix(150))\(text.count > 150 ? "..." : "")\""
    }
    
    private func handleImage(_ imageURL: URL) {
        sharedContent = SharedContent(type: .image, url: imageURL)
        contentPreviewLabel.text = "📷 Image shared"
    }
    
    private func handleImageData(_ image: UIImage) {
        sharedContent = SharedContent(type: .image, image: image)
        contentPreviewLabel.text = "📷 Image shared"
    }
    
    // MARK: - Actions
    
    @objc private func categoryTapped(_ sender: UIButton) {
        // Deselect all
        for case let button as UIButton in categoryStackView.arrangedSubviews {
            button.isSelected = false
            button.backgroundColor = UIColor.white.withAlphaComponent(0.1)
        }
        
        // Select tapped
        sender.isSelected = true
        sender.backgroundColor = UIColor(red: 0.29, green: 0.40, blue: 0.25, alpha: 0.5)
        
        if let category = ContentCategory(rawValue: sender.tag) {
            selectedCategory = category
        }
    }
    
    @objc private func saveTapped() {
        saveContent(openApp: false)
    }
    
    @objc private func talkNowTapped() {
        saveContent(openApp: true)
    }
    
    @objc private func cancelTapped() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
    
    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }
    
    // MARK: - Save Content
    
    private func saveContent(openApp: Bool) {
        guard let content = sharedContent else {
            showError("No content to save")
            return
        }
        
        // Create the shared item
        let sharedItem = SharedItem(
            id: UUID().uuidString,
            type: content.type,
            url: content.url?.absoluteString,
            text: content.text,
            note: noteTextView.text.isEmpty ? nil : noteTextView.text,
            category: selectedCategory,
            timestamp: Date()
        )
        
        // Save to App Group shared container
        saveToAppGroup(sharedItem)
        
        // Show success feedback
        UIView.animate(withDuration: 0.2) {
            self.saveButton.backgroundColor = UIColor(red: 0.3, green: 0.7, blue: 0.3, alpha: 1.0)
            self.saveButton.setTitle("Saved! ✓", for: .normal)
        }
        
        // Complete after short delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            if openApp {
                // Open Ferni app with context
                self.openFerniApp(with: sharedItem)
            } else {
                self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            }
        }
    }
    
    private func saveToAppGroup(_ item: SharedItem) {
        let defaults = UserDefaults(suiteName: "group.com.ferni.shared")
        
        // Load existing items
        var items: [SharedItem] = []
        if let data = defaults?.data(forKey: "sharedItems"),
           let decoded = try? JSONDecoder().decode([SharedItem].self, from: data) {
            items = decoded
        }
        
        // Add new item
        items.insert(item, at: 0)
        
        // Keep only last 100 items
        if items.count > 100 {
            items = Array(items.prefix(100))
        }
        
        // Save back
        if let encoded = try? JSONEncoder().encode(items) {
            defaults?.set(encoded, forKey: "sharedItems")
        }
    }
    
    private func openFerniApp(with item: SharedItem) {
        // Use URL scheme to open app with context
        let urlString = "ferni://share?id=\(item.id)"
        guard let url = URL(string: urlString) else {
            extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            return
        }
        
        extensionContext?.completeRequest(returningItems: nil) { _ in
            // Open app (this happens in the host app context)
            self.openURL(url)
        }
    }
    
    @objc private func openURL(_ url: URL) {
        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = responder?.next
        }
    }
    
    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Oops", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

// MARK: - UITextViewDelegate

extension ShareViewController: UITextViewDelegate {
    func textViewDidChange(_ textView: UITextView) {
        placeholderLabel.isHidden = !textView.text.isEmpty
    }
}

// MARK: - Supporting Types

struct SharedContent {
    let type: ContentType
    var url: URL?
    var text: String?
    var image: UIImage?
}

enum ContentType: String, Codable {
    case url
    case text
    case image
}

enum ContentCategory: Int, Codable {
    case general = 0
    case inspiration = 1
    case discuss = 2
    case remember = 3
    case journal = 4
    
    var displayName: String {
        switch self {
        case .general: return "General"
        case .inspiration: return "Inspiration"
        case .discuss: return "Discuss"
        case .remember: return "Remember"
        case .journal: return "Journal"
        }
    }
}

struct SharedItem: Codable {
    let id: String
    let type: ContentType
    let url: String?
    let text: String?
    let note: String?
    let category: ContentCategory
    let timestamp: Date
}
