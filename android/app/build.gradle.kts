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
        /* every GitHub build is newer than the last, so it installs over it */
        val run = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionCode = run
        versionName = "1.0.$run"
    }

    /* One fixed TEST key (android/aiec-test.jks, committed on purpose) signs every test build, so a new build always
       installs over the old one. It is NOT the Play Store key: that one comes only from GitHub secrets / environment. */
    val ks = System.getenv("AIEC_KEYSTORE")
    signingConfigs {
        create("aiecTest") {
            storeFile = rootProject.file("aiec-test.jks")
            storePassword = "aiectest"
            keyAlias = "aiec-test"
            keyPassword = "aiectest"
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
        if (ks != null && file(ks).exists()) {
            create("store") {
                storeFile = file(ks)
                storePassword = System.getenv("AIEC_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("AIEC_KEY_ALIAS")
                keyPassword = System.getenv("AIEC_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("aiecTest")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("store") ?: signingConfigs.getByName("aiecTest")
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
