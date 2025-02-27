{ 
  make-initial-state
, transmit-state
}: { config, lib, pkgs, ... }: 
with lib;
let 
  statesInstance = name: let 
    crg = config.initial-states.${name};
  in {
    options = {
      socketPath = mkOption rec {
        type = types.nullOr types.str;
        default = null;
        description = "path to the socket that receives the data (filled-in by the service)";
      };
      requiredFiles = mkOption rec {
        type = types.listOf types.str;
        default = [];
        description = "paths (within $STATE_DIRECTORY) that are required for the service to start (filled-in by the service)";
      };
      source = {
        vault = mkOption {
          type = types.str;
          description = "vault the initial state is stored in";
        };

        item = mkOption rec {
          type = types.nullOr types.str;
          default = null;
          description = "item inside the vault the state is stored in. Defaults to $name";
        };

        field = mkOption {
          type = lib.types.str;
          description = "field in the item";
        };
      };
    };
  };
in {
  options.initial-states = mkOption {
    type = types.attrsOf (types.submodule statesInstance);
    default = {};
    description = "Named instances of intial-states";
  };

  options.initial-states-scripts = lib.mkOption {
    type = lib.types.attrsOf lib.types.str;
    internal = true;
    default = {};
  };

  # Consume the submodule configurations
  config = let
    mkScript = comment: deco: let
      lines = attrValues (mapAttrs' (name: cfg: let
        socketPath = "${if cfg.socketPath == null then "/var/run/${name}/initial-state.socket" else cfg.socketPath}";
        item = if cfg.source.item == null then name else cfg.source.item;
        transmit-cmd = deco "sudo ${transmit-state}/bin/transmit-initial-state ${socketPath}";
      in {
        inherit name;
        value = with builtins; 
          if (length cfg.requiredFiles) == 0 then "" else
            #"secretsctl decrypt '${cfg.source.vault}/${cfg.source.item}/${cfg.source.field}' " +
            "pv \"/var/lib/initial-states/${cfg.source.vault}/${cfg.source.item}/${cfg.source.field}\" " +
            "| ${transmit-cmd}";
      }) config.initial-states);
    in
    builtins.concatStringsSep "\n" ([ 
      "set -euxo pipefail"
      "PATH=$PATH:${pkgs.pv}/bin"
      ""
      comment
      ""
    ] ++ lines);
  in {
    initial-states-scripts.import = mkScript "# Send initial states to services on local machine" (x: x);
    initial-states-scripts.send = mkScript "# Send initial states to services on remote machine" (x: "ssh ${config.networking.hostName} \"${x}\"");
    environment.systemPackages = [
      make-initial-state
      transmit-state
      (pkgs.writeScriptBin "import-initial-states" ''
      ${config.initial-states-scripts.import}
      '')
    ];
  };
}
