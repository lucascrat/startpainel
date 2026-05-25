package com.startpainel.player.ui.login

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.startpainel.player.ui.theme.BrandAccent
import com.startpainel.player.ui.theme.BrandBlue
import com.startpainel.player.ui.theme.BrandBlueDim

// Cores
private val WhatsAppGreen = Color(0xFF25D366)
private val WhatsAppDark  = Color(0xFF128C7E)

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    vm: LoginViewModel = viewModel()
) {
    val state   by vm.state.collectAsStateWithLifecycle()
    val focus   = LocalFocusManager.current
    val context = LocalContext.current
    var passwordVisible by remember { mutableStateOf(false) }

    LaunchedEffect(state.success) {
        if (state.success) onLoggedIn()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        MaterialTheme.colorScheme.background,
                        BrandBlueDim.copy(alpha = 0.4f),
                        MaterialTheme.colorScheme.background
                    )
                )
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .consumeWindowInsets(WindowInsets(0))
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .widthIn(max = 480.dp)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Logo
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = BrandBlue,
                modifier = Modifier.padding(top = 32.dp)
            ) {
                Icon(
                    Icons.Filled.PlayCircle,
                    contentDescription = "Startflix",
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.padding(16.dp)
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Startflix",
                style = MaterialTheme.typography.displayMedium.copy(
                    fontWeight = FontWeight.ExtraBold
                ),
                color = BrandBlue
            )
            Text(
                if (state.isCodeMode) "Entre com seu código de acesso"
                else "Entre com sua conta",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(28.dp))

            // ── Card de formulário ────────────────────────────────────────
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                AnimatedContent(
                    targetState = state.isCodeMode,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "login-mode"
                ) { isCode ->
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        if (isCode) {
                            // ── Modo código M3U ────────────────────────
                            CodeModeFields(
                                state = state,
                                onCodeChange = vm::onCodeChange,
                                onDone = { focus.clearFocus(); vm.submitCode() }
                            )
                        } else {
                            // ── Modo Xtream (padrão) ───────────────────
                            XtreamModeFields(
                                state = state,
                                passwordVisible = passwordVisible,
                                onUserChange = vm::onUserChange,
                                onPasswordChange = vm::onPasswordChange,
                                onTogglePassword = { passwordVisible = !passwordVisible },
                                onDone = { focus.clearFocus(); vm.submit() }
                            )
                        }

                        // Erro
                        if (state.error != null) {
                            Text(
                                state.error!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }

                        // Botão principal
                        Button(
                            onClick = {
                                focus.clearFocus()
                                if (state.isCodeMode) vm.submitCode() else vm.submit()
                            },
                            enabled = !state.loading,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = BrandBlue,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            if (state.loading) {
                                CircularProgressIndicator(
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.height(22.dp)
                                )
                            } else {
                                Text("Entrar", style = MaterialTheme.typography.titleMedium)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // ── Alternador de modo ────────────────────────────────────────
            // Em TV o acesso por código promocional não aparece — só usuário/senha
            if (!state.isTvDevice) {
                Text(
                    text = if (state.isCodeMode) "← Entrar com usuário e senha"
                           else "Tenho um código de acesso →",
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                    color = BrandAccent,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .clickable { vm.toggleMode() }
                        .padding(vertical = 4.dp)
                )
            }

            Spacer(Modifier.height(8.dp))
            Text(
                "Sua conta é gerenciada pela Startflix.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(80.dp))
        }

        // ── Diálogo de conflito de dispositivo ────────────────────────────
        if (state.showDeviceConflict) {
            AlertDialog(
                onDismissRequest = { vm.dismissDeviceConflict() },
                icon = {
                    Icon(
                        Icons.Filled.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error
                    )
                },
                title = {
                    Text(
                        "Conta em uso em outro aparelho",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                },
                text = {
                    val device = state.conflictDeviceName
                    Text(
                        if (!device.isNullOrBlank())
                            "Esta conta já está ativa em \"$device\".\n\nDeseja deslogar esse aparelho e entrar neste?"
                        else
                            "Esta conta já está ativa em outro aparelho.\n\nDeseja deslogar o outro aparelho e entrar neste?",
                        style = MaterialTheme.typography.bodyMedium
                    )
                },
                confirmButton = {
                    Button(
                        onClick = { vm.forceLogin() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Text("Sim, entrar aqui")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { vm.dismissDeviceConflict() }) {
                        Text("Cancelar")
                    }
                }
            )
        }

        // ── FAB WhatsApp ──────────────────────────────────────────────────
        if (!state.whatsappNumber.isNullOrBlank()) {
            WhatsAppFab(
                number = state.whatsappNumber!!,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 24.dp, bottom = 28.dp),
                onClick = {
                    val url = "https://wa.me/${state.whatsappNumber!!.filter { it.isDigit() }}"
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
            )
        }
    }
}

// ─── Campos modo Xtream ────────────────────────────────────────────────────

@Composable
private fun XtreamModeFields(
    state: LoginUiState,
    passwordVisible: Boolean,
    onUserChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onTogglePassword: () -> Unit,
    onDone: () -> Unit,
) {
    OutlinedTextField(
        value = state.username,
        onValueChange = onUserChange,
        label = { Text("Usuário") },
        leadingIcon = { Icon(Icons.Filled.Person, null) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        colors = textFieldColors(),
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = state.password,
        onValueChange = onPasswordChange,
        label = { Text("Senha") },
        leadingIcon = { Icon(Icons.Filled.Lock, null) },
        trailingIcon = {
            IconButton(onClick = onTogglePassword) {
                Icon(
                    if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = null
                )
            }
        },
        visualTransformation = if (passwordVisible) VisualTransformation.None
                               else PasswordVisualTransformation(),
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Password,
            imeAction = ImeAction.Done
        ),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        colors = textFieldColors(),
        modifier = Modifier.fillMaxWidth()
    )
}

// ─── Campos modo código M3U ───────────────────────────────────────────────

@Composable
private fun CodeModeFields(
    state: LoginUiState,
    onCodeChange: (String) -> Unit,
    onDone: () -> Unit,
) {
    Text(
        "Digite o código fornecido pelo seu provedor.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = state.accessCode,
        onValueChange = onCodeChange,
        label = { Text("Código de Acesso") },
        leadingIcon = { Icon(Icons.Filled.Key, null) },
        placeholder = { Text("ex.: A3F92B1C") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.Characters,
            imeAction = ImeAction.Done
        ),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        colors = textFieldColors(),
        modifier = Modifier.fillMaxWidth()
    )
}

// ─── FAB WhatsApp ─────────────────────────────────────────────────────────

@Composable
private fun WhatsAppFab(
    number: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Row(
        modifier = modifier.clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier
                .shadow(10.dp, RoundedCornerShape(16.dp))
                .clip(RoundedCornerShape(16.dp))
                .background(Color.White)
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Column(horizontalAlignment = Alignment.Start) {
                Text(
                    "🎯 Adquira seu acesso aqui",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF0D1B2A),
                    lineHeight = 14.sp
                )
                Text(
                    "Chame agora no WhatsApp →",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = WhatsAppDark,
                    lineHeight = 12.sp
                )
            }
        }

        Box(
            modifier = Modifier
                .shadow(12.dp, RoundedCornerShape(32.dp), ambientColor = WhatsAppGreen.copy(0.4f))
                .clip(RoundedCornerShape(32.dp))
                .background(Brush.linearGradient(listOf(WhatsAppGreen, WhatsAppDark)))
                .padding(horizontal = 16.dp, vertical = 12.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("💬", fontSize = 20.sp)
                Column {
                    Text(
                        "Suporte",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        lineHeight = 13.sp
                    )
                    Text(
                        "WhatsApp",
                        color = Color.White.copy(0.85f),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Medium,
                        lineHeight = 11.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun textFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = BrandAccent,
    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
    focusedLabelColor = BrandAccent,
    cursorColor = BrandAccent,
    focusedLeadingIconColor = BrandAccent,
    unfocusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant
)
