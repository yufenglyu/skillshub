/// Embedded factory-default platform icons. Copied into `.skillshub/platform` on first seed.
pub fn default_icon_bytes(file_name: &str) -> Option<&'static [u8]> {
    match file_name {
        "adal.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/adal.svg").as_slice())
        }
        "aider-desk.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/aider-desk.svg").as_slice())
        }
        "aider.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/aider.svg").as_slice())
        }
        "amp.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/amp.svg").as_slice())
        }
        "antigravity.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/antigravity.svg").as_slice())
        }
        "augment.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/augment.svg").as_slice())
        }
        "autoclaw.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/autoclaw.png").as_slice())
        }
        "bob.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/bob.svg").as_slice())
        }
        "central.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/central.svg").as_slice())
        }
        "claude-code.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/claude-code.svg").as_slice())
        }
        "cline.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/cline.svg").as_slice())
        }
        "codearts-agent.svg" => Some(
            include_bytes!("../resources/default-platforms/icons/codearts-agent.svg").as_slice(),
        ),
        "codebuddy.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/codebuddy.png").as_slice())
        }
        "codemaker.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/codemaker.svg").as_slice())
        }
        "codestudio.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/codestudio.svg").as_slice())
        }
        "codex.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/codex.png").as_slice())
        }
        "command-code.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/command-code.svg").as_slice())
        }
        "continue.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/continue.svg").as_slice())
        }
        "copilot.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/copilot.svg").as_slice())
        }
        "cortex.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/cortex.svg").as_slice())
        }
        "crush.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/crush.svg").as_slice())
        }
        "cursor.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/cursor.png").as_slice())
        }
        "deep-agents.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/deep-agents.svg").as_slice())
        }
        "devin.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/devin.svg").as_slice())
        }
        "dexto.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/dexto.svg").as_slice())
        }
        "easyclaw.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/easyclaw.png").as_slice())
        }
        "factory-droid.png" => Some(
            include_bytes!("../resources/default-platforms/icons/factory-droid.png").as_slice(),
        ),
        "firebender.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/firebender.svg").as_slice())
        }
        "forgecode.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/forgecode.svg").as_slice())
        }
        "gemini-cli.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/gemini-cli.svg").as_slice())
        }
        "goose.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/goose.svg").as_slice())
        }
        "hermes.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/hermes.png").as_slice())
        }
        "iflow-cli.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/iflow-cli.svg").as_slice())
        }
        "junie.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/junie.svg").as_slice())
        }
        "kilocode.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/kilocode.svg").as_slice())
        }
        "kimi-code-cli.svg" => Some(
            include_bytes!("../resources/default-platforms/icons/kimi-code-cli.svg").as_slice(),
        ),
        "kiro.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/kiro.png").as_slice())
        }
        "kode.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/kode.svg").as_slice())
        }
        "mcpjam.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/mcpjam.svg").as_slice())
        }
        "mistral-vibe.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/mistral-vibe.svg").as_slice())
        }
        "mux.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/mux.svg").as_slice())
        }
        "neovate.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/neovate.svg").as_slice())
        }
        "ob1.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/ob1.svg").as_slice())
        }
        "openclaw.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/openclaw.png").as_slice())
        }
        "opencode.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/opencode.svg").as_slice())
        }
        "openhands.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/openhands.svg").as_slice())
        }
        "pi.svg" => Some(include_bytes!("../resources/default-platforms/icons/pi.svg").as_slice()),
        "pochi.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/pochi.svg").as_slice())
        }
        "qclaw.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/qclaw.png").as_slice())
        }
        "qoder.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/qoder.png").as_slice())
        }
        "qwen.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/qwen.svg").as_slice())
        }
        "roo.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/roo.svg").as_slice())
        }
        "rovodev.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/rovodev.svg").as_slice())
        }
        "tabnine-cli.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/tabnine-cli.svg").as_slice())
        }
        "trae.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/trae.png").as_slice())
        }
        "warp.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/warp.svg").as_slice())
        }
        "windsurf.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/windsurf.png").as_slice())
        }
        "workbuddy.png" => {
            Some(include_bytes!("../resources/default-platforms/icons/workbuddy.png").as_slice())
        }
        "zencoder.svg" => {
            Some(include_bytes!("../resources/default-platforms/icons/zencoder.svg").as_slice())
        }
        _ => None,
    }
}
