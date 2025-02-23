# config.secrets.hetzner-robot = {
#   path = "/etc/hetzner-robot" # defaults to /etc/${name}
#   source = {
#     vault = "Business";
#     item = "hetzner-robot-api"; #defaults to ${name}
#     fields = [ "username" "credentials" ];
#   };
# }

{ package }: { config, lib, pkgs, ... }: 
with lib;
let 
  secretsInstance = name: let 
    crg = config.secrets.${name};
  in {
    options = {
      path = mkOption rec {
        type = types.nullOr types.str;
        # if this is uncommented name evals to the entire config! (wtf)
        default = null;
        description = "path the encrypted secret will be written to. Defaults to /etc/$name.creds";
      };
      source = {
        vault = mkOption {
          type = types.str;
          description = "vault the secret is stored in";
        };

        item = mkOption rec {
          type = types.nullOr types.str;
          default = null;
          description = "item inside the vault the secret is stored in. Defaults to $name";
        };

        fields = mkOption {
          type = lib.types.nonEmptyListOf lib.types.str;
          description = "list of fields in the item";
        };

        delimiter = mkOption {
          type = types.str;
          default = ",";
          defaultText = ",";
          description = "delimiter used when joining item values";
        };
      };
    };
  };
in {
  options.secrets = mkOption {
    type = types.attrsOf (types.submodule secretsInstance);
    default = {};
    description = "Named instances of secrets";
  };

  options.secrets-scripts = lib.mkOption {
    type = lib.types.attrsOf lib.types.str;
    internal = true;
    default = {};
  };

  # Consume the submodule configurations
  config = let
    mkScript = secretsBin: comment: deco: let
      lines = attrValues (mapAttrs' (name: cfg: let
        path = "${if cfg.path == null then "/etc/${name}.creds" else cfg.path}";
        item = if cfg.source.item == null then name else cfg.source.item;
        save-cmd = deco "sudo mkdir -p $(dirname ${path}) && sudo systemd-creds encrypt - ${path}";
      in {
        inherit name;
        value = with builtins; 
          "$secrets get '${cfg.source.vault}' '${item}' ${toString (map (x: "'${x}'") cfg.source.fields)} --delimiter '${cfg.source.delimiter}' " +
          "| ${save-cmd}";
      }) config.secrets);
    in
    builtins.concatStringsSep "\n" ([ 
      "set -euxo pipefail"
      ""
      comment
      ""
      "secrets=\"${secretsBin}\""
    ] ++ lines ++ []);
  in {
    secrets-scripts.import = mkScript "${package}/bin/secrets" "# Add secrets to local machine" (x: x);
    secrets-scripts.send = mkScript "secrets" "# Send secrets to remote machine" (x: "ssh ${config.networking.hostName} \"${x}\"");
    environment.systemPackages = [
      package
      (pkgs.writeScriptBin "import-secrets" ''
      ${config.secrets-scripts.import}
      '')
    ];
  };
}
