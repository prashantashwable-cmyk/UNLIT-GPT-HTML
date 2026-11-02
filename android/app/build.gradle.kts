plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.allindiaelevators.os"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.allindiaelevators.os"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    /* a signed release is made only when the keystore is given (GitHub secrets or local environment) */
    val ks = System.getenv("AIEC_KEYSTORE")
    signingConfigs {
        if (ks != null && file(ks).exists()) {
            create("release") {
                storeFile = file(ks)
                storePassword = System.getenv("AIEC_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("AIEC_KEY_ALIAS")
                keyPassword = System.getenv("AIEC_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
