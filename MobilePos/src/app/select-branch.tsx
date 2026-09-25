import { StyleSheet, Text, View } from 'react-native';

export default function SelectBranchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Branch</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
});
