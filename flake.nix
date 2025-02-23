{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    secrets-service = {
      url = "github:regular/secrets-service";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ self, nixpkgs, secrets, ... }:
    let
      system =  "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
  {
    nixosModules.default  = self.nixosModules.initial-state;
    nixosModules.initial-state = (import ./config.nix) {
      package = self.packages.${system}.default;
    };

    nixosConfigurations.demo = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        self.nixosModules.default
        {
          initial-state.my-state = {
            source = {
              vault = "my-vault";
              item = "my-service";
              fields = [ "database" ];
            };
          };
        }
      ];
    };

    packages.${system} = let
      pkg_deps = with pkgs; [ bash coreutils-full gnutar outils ];
      path = pkgs.lib.makeBinPath pkg_deps;
      boundary-string = "boundary-string-037398047ae4e13fcb3d1181622fed6f";
      make-transmit-msg = pks.writeScript "make-transmit-msg" ''
        #!${pkgs.bash}/bin/bash
        PATH=${path}
        local boundary="${boundary-string}}"
      '' + builtins.readFile ./make-transmit-msg.sh;
    
    in rec {
      # tar.gz a state directory, encrypt it and put it into /var/lib/secrets
      make-state = pkgs.writeScriptBin "make-initial-state" ''
        #!${pkgs.bash}/bin/bash
        PATH="${path}:$PATH" # we assume secretsctl to be in path
      '' + builtins.readFile ./make-state.sh;
      
      # takes a tar.gz stream on stdin and sends it to a unix socket of a local service running receive-initial-state
      transmit-state = pks.writeScriptBin "transmit-initial-state" ''
        #!${pkgs.bash}/bin/bash
        PATH=${path}
        local SERVICE=$1
        ${make-transmit-msg} | socat - UNIX-CONNECT:/var/run/$SERVICE/initial-state.socket
      '';

      receive-state = pkgs.buildNpmPackage rec {
        name = "receive-initial-state";
        src = ./receive-state;
        npmDepsHash = "";
        dontNpmBuild = true;
        makeCacheWritable = true;
        nativeBuildInputs = with pkgs; [
          makeWrapper
        ];
        postInstall = ''
          wrapProgram $out/bin/${name} \
          --set PATH "${path}"
          --set receive_state_boundary "${boundary-string"
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
