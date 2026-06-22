import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView,
  Alert
} from 'react-native';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';

// 1. IMPORT SDK FIREBASE
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// CONFIG FIREBASE ASLI MILIKMU (Menggunakan Project Sebelumnya)
const firebaseConfig = {
  apiKey: "AIzaSyAQ7hD6unYGxs-BVmvAy1f836dVErer1BY",
  authDomain: "wheatherfit-app.firebaseapp.com",
  projectId: "wheatherfit-app",
  storageBucket: "wheatherfit-app.firebasestorage.app",
  messagingSenderId: "315641438139",
  appId: "1:315641438139:web:3930c4d505121b73d3ae9e",
  measurementId: "G-4S9EQD3Z1X"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function App() {
  // State Navigasi & Keamanan Admin
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

  // State Form Customer
  const [customerName, setCustomerName] = useState('');
  const [printType, setPrintType] = useState('Berwarna'); 
  const [pages, setPages] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // State Admin
  const [inputPrices, setInputPrices] = useState({}); 
  const [orders, setOrders] = useState([]);

  // 2. REAL-TIME FETCH DATA ORDERAN DARI CLOUD FIRESTORE
  useEffect(() => {
    const q = query(collection(db, "print_orders"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const ordersArray = [];
      querySnapshot.forEach((doc) => {
        ordersArray.push({ id: doc.id, ...doc.data() });
      });
      setOrders(ordersArray);
    });
    return () => unsubscribe();
  }, []);

  // 3. FITUR KEAMANAN: LOGIN ADMIN
  const handleAdminLogin = () => {
    if (adminPassword === 'admins') {
      setIsAdminLoggedIn(true);
      setAdminPassword('');
      Alert.alert("Sukses", "Selamat Datang, Admin Percetakan!");
    } else {
      Alert.alert("Akses Ditolak", "Password Admin Salah!");
    }
  };

  // LOGOUT ADMIN
  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setIsAdminMode(false);
  };

  // 4. FITUR CUSTOMER: MEMILIH FILE DARI HP
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", 
        copyToCacheDirectory: true
      });

      if (!result.canceled) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error) {
      Alert.alert("Error", "Gagal memilih file.");
    }
  };


 // 5. FITUR CUSTOMER: KIRIM PESANAN KE FIREBASE CLOUD (ANTI-CRASH)
  const handleSendOrder = async () => {
    if (!customerName.trim() || !pages.trim() || !selectedFile) {
      Alert.alert("Gagal", "Silakan lengkapi nama, jumlah halaman, dan upload file Anda!");
      return;
    }

    setLoading(true);
    let apiTimeStr = new Date().toLocaleTimeString(); // Waktu cadangan jika API offline

    try {
      // Menembak API Publik dengan batas waktu (timeout) agar tidak menggantung lama
      const timeRes = await axios.get('https://worldtimeapi.org/api/timezone/Asia/Jakarta', { timeout: 4000 });
      if (timeRes.data && timeRes.data.datetime) {
        apiTimeStr = new Date(timeRes.data.datetime).toLocaleTimeString();
      }
    } catch (apiError) {
      console.log("API Penunjuk Waktu timeout/offline, menggunakan waktu lokal HP.");
    }

    try {
      // Push ke Cloud Firestore
      await addDoc(collection(db, "print_orders"), {
        customerName: customerName,
        printType: printType,
        pages: parseInt(pages),
        fileName: selectedFile.name,
        fileSize: (selectedFile.size / 1024 / 1024).toFixed(2) + " MB",
        status: "Menunggu Konfirmasi Biaya", 
        totalPrice: 0, 
        createdAt: new Date().toISOString(),
        orderTime: apiTimeStr
      });

      Alert.alert("Sukses Kirim!", "File berhasil terkirim ke Percetakan. Harap tunggu admin menginput biaya.");
      
      // Reset Form
      setCustomerName('');
      setPages('');
      setSelectedFile(null);
    } catch (error) {
      console.log(error);
      Alert.alert("Firebase Error", "Gagal terhubung ke database Cloud Firebase. Periksa Rules Firestore Anda.");
    } finally {
      setLoading(false);
    }
  };

  // 6. FITUR ADMIN: KIRIM KONFIRMASI BIAYA & PROSES PRINT
  const handleUpdatePrice = async (orderId) => {
    const price = inputPrices[orderId];
    if (!price || isNaN(price)) {
      Alert.alert("Peringatan", "Masukkan nominal biaya yang valid!");
      return;
    }

    try {
      const orderRef = doc(db, "print_orders", orderId);
      await updateDoc(orderRef, {
        totalPrice: parseInt(price),
        status: "Sedang Dicetak — Silakan Bayar saat Pengambilan"
      });
      Alert.alert("Berhasil", "Biaya dan konfirmasi cetak telah dikirim ke customer!");
    } catch (error) {
      Alert.alert("Error", "Gagal meng-update database cloud.");
    }
  };

  // 7. FITUR ADMIN: TANDAI SELESAI / SIAP DIAMBIL
  const handleMarkAsReady = async (orderId) => {
    try {
      const orderRef = doc(db, "print_orders", orderId);
      await updateDoc(orderRef, {
        status: "✅ SELESAI — Pesanan Siap Diambil!"
      });
    } catch (error) {
      Alert.alert("Error", "Gagal meng-update status.");
    }
  };

  // FITUR TAMBAHAN: HAPUS HISTORI PESANAN
  const handleDeleteOrder = async (id) => {
    try {
      await deleteDoc(doc(db, "print_orders", id));
    } catch (error) {
      Alert.alert("Error", "Gagal menghapus.");
    }
  };

  return (
    <View style={styles.mainWrapper}>
      {/* TOGGLE PERAN / ROLE SWITCHER */}
      <View style={styles.roleBar}>
        <TouchableOpacity 
          style={[styles.roleButton, !isAdminMode && styles.roleButtonActive]} 
          onPress={() => setIsAdminMode(false)}
        >
          <Text style={[styles.roleText, !isAdminMode && styles.roleTextActive]}>📱 Menu Customer</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.roleButton, isAdminMode && styles.roleButtonActive]} 
          onPress={() => setIsAdminMode(true)}
        >
          <Text style={[styles.roleText, isAdminMode && styles.roleTextActive]}>🛠️ Dashboard admin</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        
        {/* ==================== TAMPILAN INTERFACE CUSTOMER ==================== */}
        {!isAdminMode && (
          <View>
            <Text style={styles.title}>🖨️ ExpressPrint</Text>
            <Text style={styles.subtitle}>ngeprint gaperlu repot </Text>

            <View style={styles.card}>
              <Text style={styles.label}>Nama Customer</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Masukkan nama Anda..."
                value={customerName}
                onChangeText={setCustomerName}
              />

              <Text style={styles.label}>Jenis Cetak</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity 
                  style={[styles.radio, printType === 'Berwarna' && styles.radioSelected]} 
                  onPress={() => setPrintType('Berwarna')}
                >
                  <Text style={printType === 'Berwarna' ? styles.radioTextSelected : styles.radioText}>🎨 Warna</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.radio, printType === 'Hitam Putih' && styles.radioSelected]} 
                  onPress={() => setPrintType('Hitam Putih')}
                >
                  <Text style={printType === 'Hitam Putih' ? styles.radioTextSelected : styles.radioText}>⚫ Hitam Putih</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Jumlah Halaman Dokumen</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Contoh: 15" 
                keyboardType="numeric"
                value={pages}
                onChangeText={setPages}
              />

              <Text style={styles.label}>File Dokumen (.pdf, .docx, .png)</Text>
              <TouchableOpacity style={styles.uploadButton} onPress={handlePickDocument}>
                <Text style={styles.uploadButtonText}>
                  {selectedFile ? `✔️ ${selectedFile.name.substring(0, 25)}...` : "📁 Pilih File dari HP"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitButton} onPress={handleSendOrder} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>🚀 Kirim File ke Percetakan</Text>}
              </TouchableOpacity>
            </View>

            {/* MONITOR STATUS LAJU ORDERAN CUSTOMER */}
            <Text style={styles.sectionTitle}>📋 Status Pesanan</Text>
            {orders.length === 0 && <Text style={styles.emptyText}>Belum ada riwayat pesanan.</Text>}
            {orders.map((item) => (
              <View key={item.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <Text style={styles.customerNameText}>{item.customerName}</Text>
                  <Text style={styles.timeText}>{item.orderTime}</Text>
                </View>
                <Text style={styles.bodyText}>📄 File: {item.fileName} ({item.fileSize})</Text>
                <Text style={styles.bodyText}>🖨️ Opsi: {item.printType} ({item.pages} hal)</Text>
                
                <View style={styles.statusBadge}>
                  <Text style={styles.statusLabel}>Status:</Text>
                  <Text style={styles.statusValue}>{item.status}</Text>
                </View>

                <Text style={styles.priceTag}>
                  Biaya: {item.totalPrice === 0 ? "Menghitung..." : `Rp ${item.totalPrice.toLocaleString()}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ==================== TAMPILAN INTERFACE ADMIN PERCETAKAN ==================== */}
        {isAdminMode && (
          <View>
            {/* JIKA BELUM LOGIN, TAMPILKAN HALAMAN LOGIN SCREEN */}
            {!isAdminLoggedIn ? (
              <View style={styles.loginCard}>
                <Text style={styles.loginTitle}>🔒 Area Khusus Admin</Text>
                <Text style={styles.loginSubtitle}>Masukkan password untuk masuk ke laman admin</Text>
                
                <TextInput 
                  style={styles.input}
                  placeholder="Masukkan Password Admin..."
                  secureTextEntry={true}
                  value={adminPassword}
                  onChangeText={setAdminPassword}
                />
                
                <TouchableOpacity style={styles.loginButton} onPress={handleAdminLogin}>
                  <Text style={styles.loginButtonText}>Masuk Sistem</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // JIKA SUDAH LOGIN, TAMPILKAN DASHBOARD UTAMA ADMIN
              <View>
                <View style={styles.adminHeaderInline}>
                  <View>
                    <Text style={styles.titleAdmin}>🛠️ Admin express</Text>
                    <Text style={styles.subtitleAdmin}>print secepatnya⚡</Text>
                  </View>
                  <TouchableOpacity style={styles.logoutButton} onPress={handleAdminLogout}>
                    <Text style={styles.logoutButtonText}>Keluar 🚪</Text>
                  </TouchableOpacity>
                </View>

                {orders.length === 0 && <Text style={styles.emptyText}>Tidak ada pesanan masuk dari pelanggan.</Text>}
                {orders.map((item) => (
                  <View key={item.id} style={[styles.orderCard, { borderColor: '#CBD5E0' }]}>
                    <View style={styles.orderHeader}>
                      <Text style={styles.adminCustomerName}>{item.customerName}</Text>
                      <TouchableOpacity onPress={() => handleDeleteOrder(item.id)}>
                        <Text style={{ fontSize: 18 }}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <Text style={styles.bodyText}>📁 Nama File: <Text style={{fontWeight:'bold', color: '#2B6CB0'}}>{item.fileName}</Text></Text>
                    <Text style={styles.bodyText}>📊 Kriteria: {item.printType} — {item.pages} Halaman</Text>
                    <Text style={styles.bodyText}>⏱️ Jam Masuk: {item.orderTime}</Text>
                    <Text style={[styles.bodyText, {color: '#E28743', fontWeight: 'bold'}]}>Status Sekarang: {item.status}</Text>

                    {item.totalPrice === 0 ? (
                      <View style={styles.adminActionBox}>
                        <TextInput 
                          style={styles.priceInput}
                          placeholder="Input Total Biaya Rp..."
                          keyboardType="numeric"
                          value={inputPrices[item.id] || ''}
                          onChangeText={(text) => setInputPrices({...inputPrices, [item.id]: text})}
                        />
                        <TouchableOpacity style={styles.confirmButton} onPress={() => handleUpdatePrice(item.id)}>
                          <Text style={styles.confirmButtonText}>Kirim Biaya</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{marginTop: 10}}>
                        <Text style={{fontWeight: 'bold', color: '#2F855A'}}>Harga Deal: Rp {item.totalPrice.toLocaleString()}</Text>
                        {item.status.includes("Sedang Dicetak") && (
                          <TouchableOpacity style={styles.readyButton} onPress={() => handleMarkAsReady(item.id)}>
                            <Text style={styles.readyButtonText}>📢 Tandai Siap Diambil</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// UI STYLING MODERN
const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: '#F7FAFC' },
  roleBar: { flexDirection: 'row', paddingTop: 50, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  roleButton: { flex: 1, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  roleButtonActive: { borderBottomWidth: 3, borderBottomColor: '#3182CE' },
  roleText: { fontSize: 14, fontWeight: 'bold', color: '#718096' },
  roleTextActive: { color: '#3182CE' },
  container: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '900', color: '#1A202C', textAlign: 'center', marginTop: 10 },
  titleAdmin: { fontSize: 24, fontWeight: '900', color: '#1A202C' },
  subtitle: { fontSize: 13, color: '#718096', textAlign: 'center', marginBottom: 20, marginTop: 4 },
  subtitleAdmin: { fontSize: 12, color: '#718096', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', elevation: 3 },
  label: { fontSize: 14, fontWeight: '700', color: '#4A5568', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 15, color: '#2D3748' },
  radioGroup: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  radio: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F7FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginHorizontal: 4 },
  radioSelected: { backgroundColor: '#EBF8FF', borderColor: '#3182CE' },
  radioText: { color: '#4A5568', fontWeight: '600' },
  radioTextSelected: { color: '#3182CE', fontWeight: 'bold' },
  uploadButton: { backgroundColor: '#EDF2F7', borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#CBD5E0', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  uploadButtonText: { color: '#4A5568', fontWeight: '700' },
  submitButton: { backgroundColor: '#3182CE', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 25, elevation: 2 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A202C', marginTop: 30, marginBottom: 10 },
  orderCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EDF2F7', paddingBottom: 6 },
  customerNameText: { fontSize: 16, fontWeight: 'bold', color: '#2D3748' },
  adminCustomerName: { fontSize: 16, fontWeight: 'bold', color: '#2B6CB0' },
  timeText: { fontSize: 12, color: '#A0AEC0' },
  bodyText: { fontSize: 14, color: '#4A5568', marginVertical: 2 },
  statusBadge: { backgroundColor: '#F7FAFC', padding: 8, borderRadius: 6, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#E28743' },
  statusLabel: { fontSize: 11, color: '#718096', fontWeight: '600' },
  statusValue: { fontSize: 13, fontWeight: 'bold', color: '#2D3748' },
  priceTag: { fontSize: 16, fontWeight: 'bold', color: '#2F855A', marginTop: 10, textAlign: 'right' },
  emptyText: { textAlign: 'center', color: '#A0AEC0', marginTop: 20 },
  adminActionBox: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
  priceInput: { flex: 1, backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#CBD5E0', borderRadius: 6, padding: 8, marginRight: 8 },
  confirmButton: { backgroundColor: '#2F855A', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6 },
  confirmButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  readyButton: { backgroundColor: '#319795', paddingVertical: 10, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  readyButtonText: { color: '#FFF', fontWeight: 'bold' },
  
  // LOGIN BOX STYLES
  loginCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 25, borderWidth: 1, borderColor: '#E2E8F0', elevation: 4, marginTop: 30 },
  loginTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A202C', marginBottom: 6, textAlign: 'center' },
  loginSubtitle: { fontSize: 13, color: '#718096', marginBottom: 20, textAlign: 'center' },
  loginButton: { backgroundColor: '#1A202C', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  loginButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  adminHeaderInline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 15 },
  logoutButton: { backgroundColor: '#FED7D7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  logoutButtonText: { color: '#C53030', fontWeight: 'bold', fontSize: 12 }
});