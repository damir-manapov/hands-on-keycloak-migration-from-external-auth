package com.example.keycloak.legacy;

import java.net.URI;
import java.util.Arrays;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.keycloak.component.ComponentModel;
import org.keycloak.credential.CredentialInput;
import org.keycloak.credential.CredentialInputValidator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserCredentialModel;
import org.keycloak.storage.StorageId;
import org.keycloak.storage.UserStorageProvider;
import org.keycloak.storage.user.UserLookupProvider;
import org.jboss.logging.Logger;

public class LegacyUserStorageProvider implements
    UserStorageProvider,
    UserLookupProvider,
    CredentialInputValidator {

    static final String CONFIG_BASE_URL = "legacyBaseUrl";
    private static final Logger LOGGER = Logger.getLogger(LegacyUserStorageProvider.class);

    private final KeycloakSession session;
    private final ComponentModel model;
    private final LegacyUserService legacyUserService;
    private final ConcurrentMap<String, LegacyUserRepresentation> cache = new ConcurrentHashMap<>();

    public LegacyUserStorageProvider(KeycloakSession session, ComponentModel model) {
        this.session = session;
        this.model = model;
        String baseUrl = Optional.ofNullable(model.get(CONFIG_BASE_URL))
            .orElse("http://legacy-auth:4000/");
        this.legacyUserService = new LegacyUserService(URI.create(baseUrl));
    }

    @Override
    public void close() {
        cache.clear();
    }

    @Override
    public UserModel getUserByUsername(RealmModel realm, String username) {
        LegacyUserRepresentation legacyUser = loadUser(username).orElse(null);
        if (legacyUser == null) {
            return null;
        }
        return createAdapter(realm, legacyUser);
    }

    @Override
    public UserModel getUserById(RealmModel realm, String id) {
        StorageId storageId = new StorageId(id);
        return getUserByUsername(realm, storageId.getExternalId());
    }

    @Override
    public UserModel getUserByEmail(RealmModel realm, String email) {
        // Legacy facade does not provide an email lookup endpoint; fall back to iterating cache
        return cache.values().stream()
            .filter(user -> email.equalsIgnoreCase(user.getEmail()))
            .findFirst()
            .map(user -> createAdapter(realm, user))
            .orElse(null);
    }

    @Override
    public boolean supportsCredentialType(String credentialType) {
        return UserCredentialModel.PASSWORD.equals(credentialType);
    }

    @Override
    public boolean isConfiguredFor(RealmModel realm, UserModel user, String credentialType) {
        return supportsCredentialType(credentialType);
    }

    @Override
    public boolean isValid(RealmModel realm, UserModel user, CredentialInput credentialInput) {
        if (!supportsCredentialType(credentialInput.getType())) {
            return false;
        }
        String username = user.getUsername();
        boolean valid = legacyUserService.validateCredentials(username, credentialInput.getChallengeResponse());
        if (!valid) {
            return false;
        }

        Optional<LegacyUserRepresentation> representation = loadUser(username);
        if (representation.isEmpty()) {
            LOGGER.warnf("Legacy user %s validated but profile could not be loaded", username);
            return true;
        }

        importUserIfNeeded(realm, representation.get(), credentialInput.getChallengeResponse());
        return true;
    }

    private Optional<LegacyUserRepresentation> loadUser(String username) {
        LegacyUserRepresentation cached = cache.get(username);
        if (cached != null) {
            return Optional.of(cached);
        }
        Optional<LegacyUserRepresentation> fetched = legacyUserService.fetchUser(username);
        fetched.ifPresent(user -> cache.put(user.getUsername(), user));
        return fetched;
    }

    private UserModel createAdapter(RealmModel realm, LegacyUserRepresentation representation) {
        return new LegacyUserAdapter(session, realm, model, representation);
    }

    private void importUserIfNeeded(RealmModel realm, LegacyUserRepresentation representation, String password) {
        String username = representation.getUsername();
        UserModel local = session.users().getUserByUsername(realm, username);

        if (local == null || !StorageId.isLocalStorage(local)) {
            local = session.users().addUser(realm, username);
            local.setCreatedTimestamp(System.currentTimeMillis());
            LOGGER.infof("Imported legacy user %s into local storage", username);
        } else {
            LOGGER.debugf("Updating existing imported user %s", username);
        }

        local.setEnabled(true);
        if (local.getFederationLink() != null) {
            LOGGER.debugf("Clearing federation link for migrated user %s", username);
            local.setFederationLink(null);
        }

        if (representation.getEmail() != null) {
            local.setEmail(representation.getEmail());
            local.setEmailVerified(true);
        }

        String displayName = representation.getDisplayName();
        if (displayName != null && !displayName.isBlank()) {
            String[] parts = displayName.trim().split("\\s+");
            if (parts.length > 0) {
                local.setFirstName(parts[0]);
            }
            if (parts.length > 1) {
                local.setLastName(String.join(" ", Arrays.copyOfRange(parts, 1, parts.length)));
            }
        }

        if (representation.getRoles().isEmpty()) {
            local.removeAttribute("legacyRoles");
        } else {
            local.setAttribute("legacyRoles", representation.getRoles());
        }

        local.credentialManager().updateCredential(UserCredentialModel.password(password));
    }
}
