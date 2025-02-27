# for use in systemd services as EcecPre=
#   receive-initial-state server --socketPath socket --statePath mystate
# The idea is, that this blocks the execution of the main service until the
# initial state is received.
# Use
#   sudo secretsctl decrypt demo/demo-service/demo-item \
#     | transmit-initial-state socket
# (the piped stream must be a tar.gz
# Create it with
#   make-initial-state demo-state/ demo demo-service demo-item
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = inputs@{ self, nixpkgs, ... }:
    let
      system =  "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
  {
    nixosModules.default  = self.nixosModules.initial-states;
    nixosModules.initial-states = import ./config.nix {
      inherit (self.packages.${system}) transmit-state make-initial-state;
    };

    nixosConfigurations.demo = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        self.nixosModules.default
        {
          initial-states.my-state = {
            socketPath = "foo.socket";
            #requiredFiles = [ "my-database.sql" ];
            requiredFiles = [ ];
            source = {
              vault = "my-vault";
              item = "my-service";
              field = "database";
            };
          };
        }
      ];
    };

    packages.${system} = let
      pkg_deps = with pkgs; [ bash coreutils-full gnutar outils gawk socat gzip findutils ];
      path = pkgs.lib.makeBinPath pkg_deps;
      boundary-string = "boundary-string-037398047ae4e13fcb3d1181622fed6f";

      make-transmit-msg = pkgs.writeScript "make-transmit-msg" (''
        #!${pkgs.bash}/bin/bash
        PATH=${path}
        boundary="${boundary-string}"
      '' + builtins.readFile ./make-transmit-msg.sh);
    in rec {
      # tar.gz a state directory, encrypt it and put it into /var/lib/secrets
      make-initial-state = pkgs.writeScriptBin "make-initial-state" (''
        #!${pkgs.bash}/bin/bash
        PATH="${path}:$PATH" # we assume secretsctl to be in path
        MAKE_TRANSMIT_MSG=${make-transmit-msg}
      '' + builtins.readFile ./make-state.sh);
      
      # takes a tar.gz stream on stdin and sends it to a unix socket of a local service running receive-initial-state.
      transmit-state = pkgs.writeScriptBin "transmit-initial-state" ''
        #!${pkgs.bash}/bin/bash
        set -euo pipefail
        PATH=${path}
        SOCKET=$1
        OUTPUT=$(socat - UNIX-CONNECT:$SOCKET)

        echo "$OUTPUT" >&2
        first_word=$(echo "$OUTPUT" | head -n1 | awk '{print $1}')
        if [ "$first_word" != "ok" ]; then
            exit 1
        fi
      '';

      receive-initial-state = pkgs.buildNpmPackage rec {
        name = "receive-initial-state";
        src = ./receive-state;
        npmDepsHash = "sha256-FcBi8wpyCIIyFEarBtD4XbP8vfJssrYVwDnSaWrpinc=";
        dontNpmBuild = true;
        makeCacheWritable = true;
        nativeBuildInputs = with pkgs; [
          makeWrapper
        ];
        postInstall = ''
          wrapProgram $out/bin/${name} \
          --set PATH "${path}" \
          --set receive_state_boundary "${boundary-string}"
        '';
      };
    };

    devShells.${system}.default = pkgs.mkShell {
      buildInputs = with pkgs; [
        nodejs
        python3
      ];
    };
  };
}
