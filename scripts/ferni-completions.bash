#!/bin/bash
# Ferni CLI Bash Completions
#
# Installation:
#   Add to your ~/.bashrc or ~/.bash_profile:
#   source /path/to/voiceai/scripts/ferni-completions.bash
#
# Or copy to system completions:
#   sudo cp scripts/ferni-completions.bash /etc/bash_completion.d/ferni

_ferni_completions() {
    local cur prev commands subcommands
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # Top-level commands
    commands="deploy setup test validate audit build generate rollout health help"

    # Subcommands for each command
    case "${prev}" in
        ferni|npm)
            COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") )
            return 0
            ;;
        deploy)
            subcommands="ui agent brand landing joel evolution all --dry-run --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
        setup)
            subcommands="local icons firestore github persistence signing slack secrets all --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
        test)
            subcommands="unit e2e storage comms humanization outreach smoke quick all --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
        validate)
            subcommands="voices humanization integrations persistence all --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
        audit)
            subcommands="quality architecture legacy a11y all --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
        build)
            subcommands="frontend electron ios android apps sync store-assets --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
        generate)
            subcommands="personas env vapid marketing design-system all --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
        rollout)
            subcommands="start status advance rollback list presets --help"
            COMPREPLY=( $(compgen -W "${subcommands}" -- "${cur}") )
            return 0
            ;;
    esac

    return 0
}

# Register completion for various invocations
complete -F _ferni_completions ferni
complete -F _ferni_completions npm run ferni

echo "✓ Ferni CLI completions loaded. Try: ferni <TAB>"

