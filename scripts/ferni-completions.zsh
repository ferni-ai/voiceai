#compdef ferni
# Ferni CLI Zsh Completions
#
# Installation:
#   Add to your ~/.zshrc:
#   source /path/to/voiceai/scripts/ferni-completions.zsh
#
# Or for Oh My Zsh, copy to custom plugins:
#   mkdir -p ~/.oh-my-zsh/custom/plugins/ferni
#   cp scripts/ferni-completions.zsh ~/.oh-my-zsh/custom/plugins/ferni/_ferni
#   Then add 'ferni' to plugins in ~/.zshrc

_ferni() {
    local -a commands
    local -a deploy_cmds setup_cmds test_cmds validate_cmds audit_cmds build_cmds generate_cmds rollout_cmds

    commands=(
        'deploy:Deploy services to cloud'
        'setup:Configure development environment'
        'test:Run test suites'
        'validate:Run validations'
        'audit:Run code quality audits'
        'build:Build applications'
        'generate:Generate code and assets'
        'rollout:Manage feature rollouts'
        'health:Check system health'
        'help:Show help'
    )

    deploy_cmds=(
        'ui:Deploy UI server'
        'agent:Deploy voice agent'
        'brand:Deploy brand assets'
        'landing:Deploy landing page'
        'joel:Deploy Joel variant'
        'evolution:Deploy evolution service'
        'all:Deploy everything'
    )

    setup_cmds=(
        'local:Set up local development'
        'icons:Generate app icons'
        'firestore:Set up Firestore indexes'
        'github:Configure GitHub Actions'
        'persistence:Set up persistence'
        'signing:Configure code signing'
        'slack:Set up Slack integration'
        'secrets:Upload secrets to GCP'
        'all:Run all setup tasks'
    )

    test_cmds=(
        'unit:Run unit tests'
        'e2e:Run end-to-end tests'
        'storage:Test storage backends'
        'comms:Test communication features'
        'humanization:Test humanization pipeline'
        'outreach:Test outreach intelligence'
        'smoke:Run smoke tests'
        'quick:Quick validation suite'
        'all:Run all tests'
    )

    validate_cmds=(
        'voices:Validate voice IDs'
        'humanization:Validate humanization'
        'integrations:Validate integrations'
        'persistence:Validate persistence'
        'all:Run all validations'
    )

    audit_cmds=(
        'quality:Code quality audit'
        'architecture:Architecture validation'
        'legacy:Legacy code audit'
        'a11y:Accessibility audit'
        'all:Run all audits'
    )

    build_cmds=(
        'frontend:Build frontend'
        'electron:Build Electron app'
        'ios:Build iOS app'
        'android:Build Android app'
        'apps:Build all native apps'
        'sync:Sync web assets'
        'store-assets:Generate store assets'
    )

    generate_cmds=(
        'personas:Generate persona configs'
        'env:Generate .env.example'
        'vapid:Generate VAPID keys'
        'marketing:Generate marketing assets'
        'design-system:Build design system'
        'all:Generate everything'
    )

    rollout_cmds=(
        'start:Start a rollout'
        'status:Check rollout status'
        'advance:Advance to next stage'
        'rollback:Rollback a rollout'
        'list:List active rollouts'
        'presets:Show rollout presets'
    )

    _arguments -C \
        '1:command:->command' \
        '2:subcommand:->subcommand' \
        '*::arg:->args'

    case "$state" in
        command)
            _describe -t commands 'ferni command' commands
            ;;
        subcommand)
            case "$words[2]" in
                deploy)
                    _describe -t deploy_cmds 'deploy command' deploy_cmds
                    ;;
                setup)
                    _describe -t setup_cmds 'setup command' setup_cmds
                    ;;
                test)
                    _describe -t test_cmds 'test command' test_cmds
                    ;;
                validate)
                    _describe -t validate_cmds 'validate command' validate_cmds
                    ;;
                audit)
                    _describe -t audit_cmds 'audit command' audit_cmds
                    ;;
                build)
                    _describe -t build_cmds 'build command' build_cmds
                    ;;
                generate)
                    _describe -t generate_cmds 'generate command' generate_cmds
                    ;;
                rollout)
                    _describe -t rollout_cmds 'rollout command' rollout_cmds
                    ;;
            esac
            ;;
    esac
}

_ferni "$@"

# Also enable for npm run ferni
compdef _ferni 'npm run ferni'

