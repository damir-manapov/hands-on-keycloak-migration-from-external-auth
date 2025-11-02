package com.example.keycloak.legacy;

import java.util.Collections;
import java.util.List;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.component.ComponentModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.provider.ProviderConfigurationBuilder;
import org.keycloak.storage.UserStorageProviderFactory;

public class LegacyUserStorageProviderFactory
    implements UserStorageProviderFactory<LegacyUserStorageProvider> {
  public static final String PROVIDER_ID = "legacy-user-storage";
  private static final Logger LOGGER = Logger.getLogger(LegacyUserStorageProviderFactory.class);

  private static final List<ProviderConfigProperty> CONFIG_PROPERTIES =
      ProviderConfigurationBuilder.create()
          .property()
          .name(LegacyUserStorageProvider.CONFIG_BASE_URL)
          .label("Legacy facade base URL")
          .type(ProviderConfigProperty.STRING_TYPE)
          .helpText("Base URL for the legacy authentication facade (e.g. http://legacy-auth:4000/)")
          .defaultValue("http://legacy-auth:4000/")
          .add()
          .build();

  @Override
  public LegacyUserStorageProvider create(KeycloakSession session, ComponentModel model) {
    LOGGER.debugf("Creating LegacyUserStorageProvider for component %s", model.getName());
    return new LegacyUserStorageProvider(session, model);
  }

  @Override
  public String getId() {
    return PROVIDER_ID;
  }

  @Override
  public void init(Config.Scope config) {
    // no-op
  }

  @Override
  public void postInit(org.keycloak.models.KeycloakSessionFactory factory) {
    // no-op
  }

  @Override
  public void close() {
    // no-op
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return Collections.unmodifiableList(CONFIG_PROPERTIES);
  }

  @Override
  public String getHelpText() {
    return "Federates users from the external legacy authentication facade";
  }
}
